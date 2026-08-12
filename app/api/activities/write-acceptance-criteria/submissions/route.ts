import { getSupabaseClient } from "../../../../../lib/supabase";
import { getLLMProvider, isLLMProviderName } from "../../../../../lib/llm/factory";
import { STORIES_PER_SESSION } from "../../../../../lib/acSessionConfig";
import type { SupabaseClient } from "@supabase/supabase-js";

type UserStoryRow = { user_story_id: string; story_text: string; creator_id: string };
type LLMConfigRow = { provider: string; api_key: string; model: string };

function getToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

/**
 * Returns the next unanswered story in the session (id + position), or null if all have
 * been submitted. Extracted here because the submissions route needs it twice: once to
 * enforce sequential order before the LLM call, and once to tell the client what comes
 * next after a successful submission.
 */
async function findNextStory(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<{ next: { userStoryId: string; position: number } | null; error: string | null }> {
  const { data: sessionStories, error: storiesError } = await supabase
    .from("ac_session_story")
    .select("position, user_story_id")
    .eq("ac_session_id", sessionId)
    .order("position", { ascending: true });

  if (storiesError) return { next: null, error: storiesError.message };

  const { data: submissions, error: subError } = await supabase
    .from("submission")
    .select("user_story_id")
    .eq("ac_session_id", sessionId);

  if (subError) return { next: null, error: subError.message };

  const submittedIds = new Set((submissions ?? []).map((s) => s.user_story_id));
  const next = (sessionStories ?? []).find((s) => !submittedIds.has(s.user_story_id));

  return {
    next: next ? { userStoryId: next.user_story_id, position: next.position } : null,
    error: null,
  };
}

/**
 * POST /api/activities/write-acceptance-criteria/submissions — grades one free-text
 * acceptance-criteria submission against a given user story (REQ-FU-2).
 *
 * Write-before-disclose: the submission row is committed with grading columns null, then
 * the LLM call runs, then the row is updated. A crash between insert and update leaves an
 * ungraded row rather than a graded answer that was never recorded.
 *
 * When sessionId is provided (GitHub #256):
 *   - Validates the session is in-progress and belongs to this student.
 *   - Enforces sequential order: only the next unanswered story may be submitted. Attempting
 *     a story the student hasn't reached yet returns 409.
 *   - After grading, checks whether all four stories are now answered. If so, marks the
 *     session completed and returns sessionCompleted: true with the totals.
 */
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { userStoryId, submittedText, sessionId } = (body ?? {}) as {
    userStoryId?: unknown;
    submittedText?: unknown;
    sessionId?: unknown;
  };

  if (typeof userStoryId !== "string" || userStoryId.trim() === "") {
    return Response.json({ error: "userStoryId is required." }, { status: 400 });
  }

  if (typeof submittedText !== "string" || submittedText.trim() === "") {
    return Response.json({ error: "submittedText is required." }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase)
    return Response.json({ error: "Supabase credentials are not configured." }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user)
    return Response.json({ error: "Invalid or expired token." }, { status: 401 });

  const resolvedSessionId: string | null = typeof sessionId === "string" ? sessionId : null;

  if (resolvedSessionId) {
    // Validate the session belongs to this student and is still open.
    const { data: session, error: sessionError } = await supabase
      .from("ac_session")
      .select("ac_session_id, status")
      .eq("ac_session_id", resolvedSessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });
    if (!session) return Response.json({ error: "Session not found." }, { status: 404 });
    if (session.status === "completed") {
      return Response.json({ error: "This session is already completed." }, { status: 409 });
    }

    // Reject out-of-order submissions — the student must work through stories 1→4.
    const { next: currentStory, error: nextError } = await findNextStory(supabase, resolvedSessionId);
    if (nextError) return Response.json({ error: nextError }, { status: 500 });

    if (!currentStory) {
      return Response.json({ error: "This session is already completed." }, { status: 409 });
    }

    if (userStoryId !== currentStory.userStoryId) {
      return Response.json(
        { error: `You must submit story ${currentStory.position} before moving on.` },
        { status: 409 },
      );
    }
  }

  const { data: story, error: storyError } = await supabase
    .from("user_story")
    .select("user_story_id, story_text, creator_id")
    .eq("user_story_id", userStoryId)
    .maybeSingle();

  if (storyError) return Response.json({ error: storyError.message }, { status: 500 });
  if (!story) return Response.json({ error: "User story not found." }, { status: 404 });

  const { data: config, error: configError } = await supabase
    .from("instructor_llm_config")
    .select("provider, api_key, model")
    .eq("user_id", (story as UserStoryRow).creator_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (configError) return Response.json({ error: configError.message }, { status: 500 });
  if (!config)
    return Response.json(
      { error: "The instructor who created this prompt has not configured an LLM provider." },
      { status: 500 },
    );

  const { provider: providerName, api_key: apiKey, model } = config as LLMConfigRow;
  if (!isLLMProviderName(providerName))
    return Response.json({ error: "Configured LLM provider is invalid." }, { status: 500 });

  const provider = getLLMProvider(providerName, apiKey, model);
  if (!provider)
    return Response.json({ error: "Configured LLM provider is missing an API key." }, { status: 500 });

  const submissionId = crypto.randomUUID();

  const { error: insertError } = await supabase.from("submission").insert({
    submission_id: submissionId,
    user_id: user.id,
    user_story_id: userStoryId,
    submitted_text: submittedText,
    ac_session_id: resolvedSessionId,
  });

  if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

  let rating;
  try {
    rating = await provider.rateAcceptanceCriteria(
      (story as UserStoryRow).story_text,
      submittedText,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "The LLM provider request failed.";
    return Response.json({ error: message }, { status: 502 });
  }

  const { error: updateError } = await supabase
    .from("submission")
    .update({
      llm_score: rating.score,
      llm_feedback: rating.feedback,
      llm_provider: providerName,
      graded_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  // Session completion check and next-story pointer.
  let sessionCompleted = false;
  let nextStoryId: string | null = null;
  let totalScore: number | null = null;
  let averageScore: number | null = null;

  if (resolvedSessionId) {
    const { data: allSubmissions, error: countError } = await supabase
      .from("submission")
      .select("llm_score, user_story_id")
      .eq("ac_session_id", resolvedSessionId);

    if (!countError && allSubmissions) {
      const count = allSubmissions.length;

      if (count >= STORIES_PER_SESSION) {
        const scores = allSubmissions.map((s) => s.llm_score ?? 0);
        totalScore = scores.reduce((sum, s) => sum + s, 0);
        averageScore = Math.round(((totalScore ?? 0) / count) * 10) / 10;

        await supabase
          .from("ac_session")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            total_score: totalScore,
          })
          .eq("ac_session_id", resolvedSessionId);

        sessionCompleted = true;
      } else {
        // Reuse the helper to avoid repeating the "find next" query logic.
        const { next } = await findNextStory(supabase, resolvedSessionId);
        nextStoryId = next?.userStoryId ?? null;
      }
    }
  }

  return Response.json(
    { submissionId, score: rating.score, feedback: rating.feedback, sessionCompleted, nextStoryId, totalScore, averageScore },
    { status: 200 },
  );
}
