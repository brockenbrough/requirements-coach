"use client";

// GitHub #149: client for the "Write Acceptance Criteria" activity (REQ-FU-2). Same role as
// lib/sessionClient.ts for the Type A flow: the one place the UI talks to these routes, so no
// component hand-rolls the Authorization header or picks apart an error body. The session-start/
// resume/current routes this now talks to are the AC equivalents of POST /api/sessions and
// GET /api/sessions/current — same session_log table, same abandon route (lib/sessionClient.ts's
// abandonSession/loadCompletedAttempts are reused directly for this activity, unmodified).

import type {
  AcceptanceCriteriaResult,
  UserStoryPrompt,
} from "./acceptanceCriteriaTypes";
import type { SessionRecord } from "./sessionTypes";
import { toInstant } from "./dateTime";

// Already the shape the route returns (camelCase, pre-aggregated) — re-exported here so this
// file stays the one import components need, the same role sessionClient.ts's re-export of
// SessionRecord plays for lib/sessionTypes.ts.
import type { AcceptanceCriteriaStatistics } from "./acceptanceCriteriaStatisticsQueries";
export type { AcceptanceCriteriaStatistics } from "./acceptanceCriteriaStatisticsQueries";

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
export type AcSessionStory = { position: number } & UserStoryPrompt;

/** One submission already made in a session — the AC equivalent of SessionAnswer. */
export type AcSessionSubmission = {
  submissionId: string;
  userStoryId: string;
  submittedText: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
};

export type StartAcSessionResult = {
  session: SessionRecord;
  stories: AcSessionStory[];
  resumed: boolean;
};

export type CurrentAcSessionResult = {
  session: SessionRecord | null;
  stories: AcSessionStory[];
  submissions: AcSessionSubmission[];
  answeredCount: number;
  nextPosition: number | null;
  completed?: boolean;
};

/**
 * Starts the activity, or picks up the session already running — the AC equivalent of
 * sessionClient.ts's startSession. uq_session_log_one_active makes "start" and "resume" the
 * same call here too: 201 for a fresh draw, 200 with resumed: true for the existing one.
 */
export function startOrResumeAcceptanceCriteriaSession(
  token: string,
): Promise<ApiResult<StartAcSessionResult>> {
  return request<StartAcSessionResult>(
    "/api/activities/write-acceptance-criteria/sessions",
    postJson({}),
    token,
  );
}

/**
 * The running session with its stories and the submissions made so far.
 * session: null (with a 200) means nothing is in progress — not an error, the AC equivalent of
 * sessionClient.ts's loadCurrentSession.
 */
export function loadCurrentAcceptanceCriteriaSession(
  token: string,
): Promise<ApiResult<CurrentAcSessionResult>> {
  return request<CurrentAcSessionResult>(
    "/api/activities/write-acceptance-criteria/sessions/current",
    { method: "GET" },
    token,
  );
}

export type InstructorACSubmission = {
  submissionId: string;
  studentId: string;
  studentName: string;
  userStoryDescription: string;
  /** GitHub #276: user_story.difficulty_level, so the combined dashboard's Level filter applies here too. */
  difficultyLevel: 1 | 2 | 3;
  submittedText: string;
  llmScore: number | null;
  llmFeedback: string | null;
  submittedAt: string;
  gradedAt: string | null;
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
 * (lib/acceptanceCriteriaStatisticsQueries.ts); this is a plain pass-through, not a cache — the
 * same "always fresh" treatment loadInstructorACSubmissions above gets, since a newly graded
 * submission should move the average right away.
 */
export function loadAcceptanceCriteriaStatistics(
  token: string,
): Promise<ApiResult<{ statistics: AcceptanceCriteriaStatistics }>> {
  return request<{ statistics: AcceptanceCriteriaStatistics }>(
    "/api/instructor/acceptance-criteria/statistics",
    { method: "GET" },
    token,
  );
}

export type SubmitAcceptanceCriteriaResult = AcceptanceCriteriaResult & {
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
export async function submitAcceptanceCriteria(
  token: string,
  sessionId: string,
  userStoryId: string,
  submittedText: string,
): Promise<ApiResult<SubmitAcceptanceCriteriaResult>> {
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
    "/api/activities/write-acceptance-criteria/submissions",
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
