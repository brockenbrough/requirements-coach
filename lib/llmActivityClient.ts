"use client";

// GitHub #149: client for the "Write Acceptance Criteria" activity (REQ-FU-2). Same role as
// lib/sessionClient.ts for the Type A flow: the one place the UI talks to these routes, so no
// component hand-rolls the Authorization header or picks apart an error body. The session-start/
// resume/current routes this now talks to are the AC equivalents of POST /api/sessions and
// GET /api/sessions/current — same session_log table, same abandon route (lib/sessionClient.ts's
// abandonSession/loadCompletedAttempts are reused directly for this activity, unmodified).

import type {
  LlmGradingResult,
  UserStoryPrompt,
} from "./llmActivityTypes";
import type { SessionRecord } from "./sessionTypes";
import { toInstant } from "./dateTime";

// Already the shape the route returns (camelCase, pre-aggregated) — re-exported here so this
// file stays the one import components need, the same role sessionClient.ts's re-export of
// SessionRecord plays for lib/sessionTypes.ts.
import type { LlmActivityStatistics } from "./llmActivityStatisticsQueries";
export type { LlmActivityStatistics } from "./llmActivityStatisticsQueries";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const NETWORK_ERROR = "Could not reach the server. Please try again.";

async function request<T>(
  url: string,
  init: RequestInit,
  token: string,
): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  } catch {
    // status 0 marks "never reached the server", so callers can tell it apart from a 500.
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: body?.error || "Something went wrong.",
    };
  }

  return { ok: true, data: body as T };
}

function postJson(payload: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

/** One drawn story in a session, in presentation order — the AC equivalent of SessionQuestion. */
export type LlmSessionStory = { position: number } & UserStoryPrompt;

/** One submission already made in a session — the AC equivalent of SessionAnswer. */
export type LlmSessionSubmission = {
  submissionId: string;
  userStoryId: string;
  submittedText: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
};

export type StartLlmSessionResult = {
  session: SessionRecord;
  stories: LlmSessionStory[];
  resumed: boolean;
};

export type CurrentLlmSessionResult = {
  session: SessionRecord | null;
  stories: LlmSessionStory[];
  submissions: LlmSessionSubmission[];
  answeredCount: number;
  nextPosition: number | null;
  completed?: boolean;
};

/**
 * Starts an LLM-graded activity, or picks up the session already running — the equivalent of
 * sessionClient.ts's startSession. uq_session_log_one_active makes "start" and "resume" the
 * same call here too: 201 for a fresh draw, 200 with resumed: true for the existing one.
 *
 * GitHub #379: activityType is a parameter now rather than baked into the URL, and
 * difficultyLevel is forwarded only when the caller passes one — the same rule startSession
 * follows, so a plain Start is unaffected and the server picks the auto-advance level itself.
 */
export function startOrResumeLlmSession(
  token: string,
  activityType: string,
  options: { difficultyLevel?: number } = {},
): Promise<ApiResult<StartLlmSessionResult>> {
  const body = options.difficultyLevel === undefined ? {} : { difficultyLevel: options.difficultyLevel };

  return request<StartLlmSessionResult>(
    `/api/activities/${encodeURIComponent(activityType)}/llm/sessions`,
    postJson(body),
    token,
  );
}

/**
 * The running session with its prompts and the submissions made so far.
 * session: null (with a 200) means nothing is in progress — not an error, the equivalent of
 * sessionClient.ts's loadCurrentSession.
 */
export function loadCurrentLlmSession(
  token: string,
  activityType: string,
): Promise<ApiResult<CurrentLlmSessionResult>> {
  return request<CurrentLlmSessionResult>(
    `/api/activities/${encodeURIComponent(activityType)}/llm/sessions/current`,
    { method: "GET" },
    token,
  );
}

export type InstructorACSubmission = {
  submissionId: string;
  studentId: string;
  studentName: string;
  userStoryDescription: string;
  /** GitHub #379: which llm-graded activity this submission belongs to, so the dashboard can
   *  label it instead of assuming the one seeded activity. */
  activityType: string;
  /** GitHub #276: user_story.difficulty_level, so the combined dashboard's Level filter applies here too. */
  difficultyLevel: 1 | 2 | 3;
  submittedText: string;
  llmScore: number | null;
  llmFeedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
  /** GitHub #474: every course this submission's catalog is currently linked to; [] means none yet. */
  courses: { courseId: string; courseName: string }[];
};

/** GET /api/instructor/acceptance-criteria/submissions — all AC submissions, optionally scoped to one student. */
export function loadInstructorACSubmissions(
  token: string,
  options: { studentId?: string } = {},
): Promise<ApiResult<{ submissions: InstructorACSubmission[] }>> {
  const params = options.studentId ? `?studentId=${encodeURIComponent(options.studentId)}` : '';
  return request<{ submissions: InstructorACSubmission[] }>(
    `/api/instructor/acceptance-criteria/submissions${params}`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (!result.ok) return result;

    // submission.submitted_at/graded_at are zone-less like session_log's timestamps — pinned to
    // UTC here so the combined Instructor Dashboard (GitHub #276) renders the right local date.
    const submissions = result.data.submissions.map((submission) => ({
      ...submission,
      submittedAt: toInstant(submission.submittedAt),
      gradedAt: submission.gradedAt === null ? null : toInstant(submission.gradedAt),
    }));

    return { ok: true as const, data: { submissions } };
  });
}

/**
 * GET /api/instructor/acceptance-criteria/statistics — class-wide aggregates for the
 * write-acceptance-criteria activity (GitHub #152, #155). Already pre-aggregated server-side
 * (lib/llmActivityStatisticsQueries.ts); this is a plain pass-through, not a cache — the
 * same "always fresh" treatment loadInstructorACSubmissions above gets, since a newly graded
 * submission should move the average right away.
 */
export function loadLlmActivityStatistics(
  token: string,
  options: { activityType?: string } = {},
): Promise<ApiResult<{ statistics: LlmActivityStatistics }>> {
  const query = options.activityType ? `?activityType=${encodeURIComponent(options.activityType)}` : '';

  return request<{ statistics: LlmActivityStatistics }>(
    `/api/instructor/acceptance-criteria/statistics${query}`,
    { method: "GET" },
    token,
  );
}

export type SubmitLlmAnswerResult = LlmGradingResult & {
  session: SessionRecord;
  answeredCount: number;
  nextPosition: number | null;
  completed: boolean;
};

/**
 * POST .../submissions: commits the answer, then returns the LLM's grading of it plus the
 * session's updated progress — the play page updates its local state from this response rather
 * than making a second round trip to sessions/current.
 *
 * sessionId is required (GitHub #256, cost/abuse fix) — every graded submission must belong to
 * a real, in-progress session_log row.
 */
export async function submitLlmAnswer(
  token: string,
  activityType: string,
  sessionId: string,
  userStoryId: string,
  submittedText: string,
): Promise<ApiResult<SubmitLlmAnswerResult>> {
  const result = await request<{
    submission: {
      submissionId: string;
      userStoryId: string;
      submittedText: string;
      score: number;
      feedback: string;
      submittedAt: string;
    };
    session: SessionRecord;
    answeredCount: number;
    nextPosition: number | null;
    completed: boolean;
  }>(
    `/api/activities/${encodeURIComponent(activityType)}/llm/submissions`,
    postJson({ userStoryId, submittedText, sessionId }),
    token,
  );

  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      submissionId: result.data.submission.submissionId,
      submittedText: result.data.submission.submittedText,
      score: result.data.submission.score,
      feedback: result.data.submission.feedback,
      session: result.data.session,
      answeredCount: result.data.answeredCount,
      nextPosition: result.data.nextPosition,
      completed: result.data.completed,
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt authoring (GitHub #379)
//
// The instructor-facing counterpart to createQuestion/updateQuestion/deleteQuestion, which live in
// lib/sessionClient.ts for historical reasons — a student-flow client owning instructor CRUD is an
// oddity worth not repeating, so the prompt equivalents live here, next to everything else that
// talks about user_story rows.
// ---------------------------------------------------------------------------

export type UserStoryDraft = {
  storyText: string;
  activityType: string;
  difficultyLevel: 1 | 2 | 3;
};

/** Adds a prompt to an LLM-graded catalog (POST /api/instructor/user-stories). */
export function createUserStory(
  token: string,
  input: UserStoryDraft,
): Promise<ApiResult<{ userStoryId: string }>> {
  return request<{ userStoryId: string }>("/api/instructor/user-stories", postJson(input), token);
}

/** Edits a prompt the caller authored (PATCH /api/instructor/user-stories/{userStoryId}). */
export function updateUserStory(
  token: string,
  userStoryId: string,
  input: UserStoryDraft,
): Promise<ApiResult<{ userStoryId: string }>> {
  return request<{ userStoryId: string }>(
    `/api/instructor/user-stories/${encodeURIComponent(userStoryId)}`,
    { ...postJson(input), method: "PATCH" },
    token,
  );
}

/**
 * Removes a prompt the caller authored (DELETE /api/instructor/user-stories/{userStoryId}).
 * A 409 here means the prompt has already reached a student and is not deletable — surfaced as-is
 * so the page can show the route's own explanation.
 */
export function deleteUserStory(
  token: string,
  userStoryId: string,
): Promise<ApiResult<{ userStoryId: string }>> {
  return request<{ userStoryId: string }>(
    `/api/instructor/user-stories/${encodeURIComponent(userStoryId)}`,
    { method: "DELETE" },
    token,
  );
}
