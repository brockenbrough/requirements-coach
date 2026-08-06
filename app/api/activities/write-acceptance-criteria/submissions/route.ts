import { getSupabaseClient } from "../../../../../lib/supabase";
import {
  getLLMProvider,
  isLLMProviderName,
} from "../../../../../lib/llm/factory";

type UserStoryRow = { user_story_id: string; story_text: string };
type LLMConfigRow = { provider: string; api_key: string };

function getToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

/**
 * POST /api/activities/write-acceptance-criteria/submissions — grades one free-text
 * acceptance-criteria submission against a given user story (REQ-FU-2).
 *
 * Write-before-disclose, same shape as POST .../answers: the submission row is committed
 * with the grading columns still null, then the LLM call runs, then the row is updated with
 * the result. A crash between insert and update leaves an ungraded row rather than a graded
 * answer that was never recorded.
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

  const { userStoryId, submittedText } = (body ?? {}) as {
    userStoryId?: unknown;
    submittedText?: unknown;
  };

  if (typeof userStoryId !== "string" || userStoryId.trim() === "") {
    return Response.json(
      { error: "userStoryId is required." },
      { status: 400 },
    );
  }

  // Rejected before any DB write or LLM call.
  if (typeof submittedText !== "string" || submittedText.trim() === "") {
    return Response.json(
      { error: "submittedText is required." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseClient();
  if (!supabase)
    return Response.json(
      { error: "Supabase credentials are not configured." },
      { status: 500 },
    );

  // The student id comes from the auth session, never from the request body.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user)
    return Response.json(
      { error: "Invalid or expired token." },
      { status: 401 },
    );

  const { data: story, error: storyError } = await supabase
    .from("user_story")
    .select("user_story_id, story_text")
    .eq("user_story_id", userStoryId)
    .maybeSingle();

  if (storyError)
    return Response.json({ error: storyError.message }, { status: 500 });
  if (!story)
    return Response.json({ error: "User story not found." }, { status: 404 });

  // One global setting today, not per-instructor-of-record: exactly one row is expected to
  // carry is_active = true. Two active rows makes maybeSingle() itself error, which is reported
  // below as the same "no usable config" 500 a missing row would give.
  const { data: config, error: configError } = await supabase
    .from("instructor_llm_config")
    .select("provider, api_key")
    .eq("is_active", true)
    .maybeSingle();

  if (configError)
    return Response.json({ error: configError.message }, { status: 500 });
  if (!config)
    return Response.json(
      { error: "No active LLM provider is configured." },
      { status: 500 },
    );

  const { provider: providerName, api_key: apiKey } = config as LLMConfigRow;
  if (!isLLMProviderName(providerName)) {
    return Response.json(
      { error: "Configured LLM provider is invalid." },
      { status: 500 },
    );
  }

  const provider = getLLMProvider(providerName, apiKey);
  if (!provider) {
    return Response.json(
      { error: "Configured LLM provider is missing an API key." },
      { status: 500 },
    );
  }

  const submissionId = crypto.randomUUID();

  // Committed before the LLM call runs, with llm_score/llm_feedback/llm_provider/graded_at
  // still null — see the Submission Bank comment in supabase/schema.sql for why they start
  // nullable.
  const { error: insertError } = await supabase.from("submission").insert({
    submission_id: submissionId,
    user_id: user.id,
    user_story_id: userStoryId,
    submitted_text: submittedText,
  });

  if (insertError)
    return Response.json({ error: insertError.message }, { status: 500 });

  let rating;
  try {
    rating = await provider.rateAcceptanceCriteria(
      (story as UserStoryRow).story_text,
      submittedText,
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "The LLM provider request failed.";
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

  if (updateError)
    return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json(
    { submissionId, score: rating.score, feedback: rating.feedback },
    { status: 200 },
  );
}
