import { getSupabaseClient } from "../../../../../../lib/supabase";
import { getGradingKind } from "../../../../../../lib/activityTypes";
import { getLLMProvider, isLLMProviderName } from "../../../../../../lib/llm/factory";
import { decryptSecret } from "../../../../../../lib/secretEncryption";
import { SESSION_COLUMNS, isPassing } from "../../../../../../lib/sessionRules";
import { awardedScoreForRating } from "../../../../../../lib/llmActivityRules";
import {
  loadSessionStories,
  loadSessionSubmissions,
  nextUnansweredStoryPosition,
  type SessionStorySlot,
} from "../../../../../../lib/llmActivityQueries";
import type { SupabaseClient } from "../../../../../../lib/sessionQueries";

type UserStoryRow = {
  user_story_id: string;
  story_text: string;
  creator_id: string;
  difficulty_level: 1 | 2 | 3;
  catalog: { rating_prompt: string | null } | null;
};
type LLMConfigRow = { provider: string; api_key: string; model: string };
type SessionRow = { session_id: string; status: string; cumulative_score: number; max_score: number };

const UNIQUE_VIOLATION = "23505";

/**
 * Hard cap on submittedText, enforced before any DB write or LLM call. Without this, a caller
 * could pay for (and make the instructor's provider pay for) an arbitrarily large completion by
 * submitting an arbitrarily large prompt — this is a coarse token-cost bound, not a UX limit.
 */
const MAX_SUBMITTED_TEXT_LENGTH = 5000;

function getToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

/**
 * POST /api/activities/:activityType/llm/submissions — grades one free-text submission against a
 * given prompt (REQ-FU-2, generalized in GitHub #379). The generic replacement for the hardcoded
 * write-acceptance-criteria route: WRITE_ACCEPTANCE_CRITERIA is one activityType this serves.
 *
 * Write-before-disclose: the submission row is committed with grading columns null, then the
 * LLM call runs, then the row is updated — a crash between insert and update leaves an ungraded
 * row rather than a graded answer that was never recorded.
 *
 * sessionId is required (GitHub #256, cost/abuse fix): every graded submission must belong to a
 * real, in-progress session_log row (the same table and abandon route Type A uses — see
 * lib/llmActivityQueries.ts), so this route can never be reduced to "auth check +
 * unthrottled LLM call". A session only ever admits STORIES_PER_SESSION graded submissions (one
 * per story, ever), which is what actually bounds LLM spend per session:
 *   - Validates the session is in-progress and belongs to this student.
 *   - Enforces sequential order: only the next unanswered story may be submitted. Attempting a
 *     story the student hasn't reached yet — or one outside this session's drawn set — is
 *     rejected.
 *   - After grading, checks whether every story is now answered. If so, marks the session
 *     completed and returns sessionCompleted: true with the totals.
 *
 * Grading rubric: the LLM prompt substitutes the story's own catalog's custom rating_prompt
 * (activity_type.rating_prompt) for the built-in RATING_RUBRIC (lib/llm/promptUtils.ts) whenever
 * one is set — read via the catalog embed on the user_story fetch below.
 */
export async function POST(request: Request, { params }: { params: { activityType: string } }) {
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

  if (submittedText.length > MAX_SUBMITTED_TEXT_LENGTH) {
    return Response.json(
      { error: `submittedText must be ${MAX_SUBMITTED_TEXT_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    return Response.json({ error: "sessionId is required." }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase)
    return Response.json({ error: "Supabase credentials are not configured." }, { status: 500 });

  const { activityType } = params;

  const { gradingKind, error: kindError } = await getGradingKind(supabase, activityType);
  if (kindError) return Response.json({ error: kindError.message }, { status: 500 });
  if (gradingKind === null) return Response.json({ error: "Unknown activity type." }, { status: 400 });
  if (gradingKind !== "llm-graded") {
    return Response.json(
      { error: "This activity is a multiple-choice quiz — answer it with POST /api/sessions/{id}/answers." },
      { status: 400 },
    );
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user)
    return Response.json({ error: "Invalid or expired token." }, { status: 401 });

  // Scoping by user_id + activity_type is what keeps one student out of another's session (and
  // out of an MCQ session id, or another LLM-graded activity's, entirely) — a foreign or
  // wrong-activity session id is indistinguishable from a non-existent one. Now that more than
  // one activity can be LLM-graded, matching params.activityType rather than a fixed literal is
  // what keeps one activity's session id from being usable against another's endpoint.
  const { data: session, error: sessionError } = await supabase
    .from("session_log")
    .select(SESSION_COLUMNS)
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .eq("activity_type", activityType)
    .maybeSingle();

  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });
  if (!session) return Response.json({ error: "Session not found." }, { status: 404 });

  const sessionRow = session as SessionRow;

  if (sessionRow.status !== "in-progress") {
    return Response.json(
      { error: `Session is ${sessionRow.status}.`, session },
      { status: 409 },
    );
  }

  const { stories, error: storiesError } = await loadSessionStories(supabase, sessionId);
  if (storiesError) return Response.json({ error: storiesError.message }, { status: 500 });

  const asked = (stories ?? []).find((story) => story.userStoryId === userStoryId);
  if (!asked) {
    return Response.json({ error: "This story does not belong to this session." }, { status: 400 });
  }

  const { submissions: existingSubmissions, error: submissionsError } = await loadSessionSubmissions(
    supabase,
    sessionId,
  );
  if (submissionsError) return Response.json({ error: submissionsError.message }, { status: 500 });

  const submittedStoryIds = new Set((existingSubmissions ?? []).map((submission) => submission.userStoryId));
  const nextPosition = nextUnansweredStoryPosition(stories ?? [], submittedStoryIds);

  if (nextPosition === null) {
    return Response.json({ error: "This session is already completed." }, { status: 409 });
  }

  if (asked.position !== nextPosition) {
    const currentStory = (stories ?? []).find((story) => story.position === nextPosition);
    return Response.json(
      { error: `You must submit story ${(currentStory?.position ?? 0) + 1} before moving on.` },
      { status: 409 },
    );
  }

  const { data: story, error: storyError } = await supabase
    .from("user_story")
    .select("user_story_id, story_text, creator_id, difficulty_level, catalog:activity_type(rating_prompt)")
    .eq("user_story_id", userStoryId)
    .maybeSingle();

  if (storyError) return Response.json({ error: storyError.message }, { status: 500 });
  if (!story) return Response.json({ error: "User story not found." }, { status: 404 });

  const storyRow = story as unknown as UserStoryRow;
  const creatorId = storyRow.creator_id;
  if (!creatorId)
    return Response.json(
      { error: "The instructor who created this prompt has not configured an LLM provider." },
      { status: 500 },
    );

  const { data: config, error: configError } = await supabase
    .from("instructor_llm_config")
    .select("provider, api_key, model")
    .eq("user_id", creatorId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (configError) return Response.json({ error: configError.message }, { status: 500 });
  if (!config)
    return Response.json(
      { error: "The instructor who created this prompt has not configured an LLM provider." },
      { status: 500 },
    );

  const { provider: providerName, api_key: storedApiKey, model } = config as LLMConfigRow;
  if (!isLLMProviderName(providerName))
    return Response.json({ error: "Configured LLM provider is invalid." }, { status: 500 });

  // storedApiKey is ciphertext (lib/secretEncryption.ts) — decrypted only here, in memory, at the
  // point it's handed to the provider SDK. null covers both a missing/misconfigured
  // LLM_CONFIG_ENCRYPTION_KEY and a row saved before encryption existed (see
  // supabase/schema.sql's migration note).
  const apiKey = decryptSecret(storedApiKey);
  if (!apiKey) return Response.json({ error: "Configured LLM provider key could not be read." }, { status: 500 });

  const provider = getLLMProvider(providerName, apiKey, model);
  if (!provider)
    return Response.json({ error: "Configured LLM provider is missing an API key." }, { status: 500 });

  const submissionId = crypto.randomUUID();

  const { error: insertError } = await supabase.from("submission").insert({
    submission_id: submissionId,
    user_id: user.id,
    user_story_id: userStoryId,
    submitted_text: submittedText,
    session_id: sessionId,
  });

  if (insertError) {
    // uq_submission_session_user_story: this story was already submitted in this session.
    if (insertError.code === UNIQUE_VIOLATION) {
      return Response.json({ error: "This story has already been submitted." }, { status: 409 });
    }
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  let rating;
  try {
    rating = await provider.rateAcceptanceCriteria(storyRow.story_text, submittedText, storyRow.catalog?.rating_prompt);
  } catch (err) {
    const message = err instanceof Error ? err.message : "The LLM provider request failed.";
    return Response.json({ error: message }, { status: 502 });
  }

  const gradedAt = new Date().toISOString();

  // Gamification points, scaled from the raw 1-10 rating onto this prompt's difficulty (REQ-GAM):
  // a Medium (level 2) prompt rated 7/10 earns round(7/10 * 40) = 28 points. Stored separately
  // from llm_score so the raw rating keeps driving feedback/statistics unchanged — see
  // submission.awarded_score's own comment in supabase/schema.sql.
  const awardedScore = awardedScoreForRating(rating.score, storyRow.difficulty_level);

  const { error: updateError } = await supabase
    .from("submission")
    .update({
      llm_score: rating.score,
      awarded_score: awardedScore,
      llm_feedback: rating.feedback,
      llm_provider: providerName,
      graded_at: gradedAt,
    })
    .eq("submission_id", submissionId);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  // Re-read rather than compute locally: cumulative_score was raised by trg_submission_score,
  // and a parallel submission from another device may have raised it further.
  const progress = await loadProgress(supabase, sessionId, stories ?? []);
  if (progress.error) return Response.json({ error: progress.error }, { status: 500 });

  const finished = progress.nextPosition === null
    ? await completeLlmSession(supabase, sessionId, progress.session as SessionRow)
    : progress.session;

  return Response.json(
    {
      submission: {
        submissionId,
        userStoryId,
        submittedText,
        score: rating.score,
        feedback: rating.feedback,
        submittedAt: gradedAt,
      },
      session: finished,
      answeredCount: progress.answeredCount,
      nextPosition: progress.nextPosition,
      completed: progress.nextPosition === null,
    },
    { status: 200 },
  );
}

/** Current session state plus the next unsubmitted position — the LLM-graded equivalent of the MCQ answers route's loadProgress. */
async function loadProgress(supabase: SupabaseClient, sessionId: string, stories: SessionStorySlot[]) {
  const [{ data: session, error: sessionError }, { submissions, error: submissionsError }] = await Promise.all([
    supabase.from("session_log").select(SESSION_COLUMNS).eq("session_id", sessionId).maybeSingle(),
    loadSessionSubmissions(supabase, sessionId),
  ]);

  const error = sessionError?.message ?? submissionsError?.message ?? null;
  const submittedStoryIds = new Set((submissions ?? []).map((submission) => submission.userStoryId));

  return {
    session,
    answeredCount: submittedStoryIds.size,
    nextPosition: nextUnansweredStoryPosition(stories, submittedStoryIds),
    error,
  };
}

/**
 * Closes out the session after the last story is graded. status and passed are decided here,
 * never by the client. The status guard keeps a parallel request from completing it twice.
 */
async function completeLlmSession(supabase: SupabaseClient, sessionId: string, session: SessionRow) {
  const { data, error } = await supabase
    .from("session_log")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      passed: isPassing(session.cumulative_score, session.max_score),
    })
    .eq("session_id", sessionId)
    .eq("status", "in-progress")
    .select(SESSION_COLUMNS)
    .maybeSingle();

  // No row came back because someone else completed it first — their version is authoritative.
  if (error || !data) return session;
  return data;
}
