'use client';

// Single place where the UI talks to the API routes behind a student's practice — sessions
// and the progress derived from them — in the same spirit as lib/authClient.ts for the auth
// routes: no page hand-rolls the Authorization header or picks apart an error body.
//
// The shapes below mirror what the routes actually return — notably, a question
// carries its options *without* is_correct or explanation. Those only ever arrive
// from the feedback route, and only after the answer has been committed.

import type { ActivityType } from './activityTypes';
import { getCachedCompletedSessions, setCachedCompletedSessions } from './completedSessionsStore';
import { getCachedScore, setCachedScore } from './scoreStore';

export type SessionRecord = {
  session_id: string;
  user_id: string;
  activity_type: string;
  difficulty_level: number;
  started_at: string;
  ended_at: string | null;
  status: string;
  cumulative_score: number;
  max_score: number;
  passed: boolean;
  badge_id: string | null;
};

export type SessionQuestionOption = {
  answer_id: string;
  option_text: string;
};

export type SessionQuestion = {
  position: number;
  question_id: string;
  question_prompt: string;
  difficulty_level: number;
  activity_type: string;
  max_score: number;
  options: SessionQuestionOption[];
};

export type SessionAnswer = {
  question_id: string;
  answer_id: string;
  score: number;
  submitted_at: string;
  correct: boolean | null;
  explanation: string | null;
};

/** A session as the list endpoint returns it: the record plus how far it got. */
export type SessionListEntry = SessionRecord & {
  questionCount: number;
  answeredCount: number;
  nextPosition: number | null;
};

export type StartSessionResult = {
  session: SessionRecord;
  questions: SessionQuestion[];
  resumed: boolean;
};

export type CurrentSessionResult = {
  session: SessionRecord | null;
  questions: SessionQuestion[];
  answers: SessionAnswer[];
  answeredCount?: number;
  nextPosition: number | null;
  completed?: boolean;
};

/** The answered_question_log row created by a submission (REQ-DL-4.1). */
export type SubmittedAnswerRecord = {
  logId: string;
  sessionId: string;
  questionId: string;
  /** The answer_id that was recorded — named after the request field that carried it. */
  selectedOptionId: string;
  score: number;
  /** Set by the database, so null only in the pathological case where the write did not echo it back. */
  submittedAt: string | null;
};

export type SubmitAnswerResult = {
  answer: SubmittedAnswerRecord;
  correct: boolean;
  explanation: string | null;
  score: number;
  session: SessionRecord;
  answeredCount: number;
  nextPosition: number | null;
  completed: boolean;
};

/** One finished attempt, as GET /api/sessions/completed returns it. */
export type CompletedAttempt = {
  sessionId: string;
  difficultyLevel: number;
  score: number;
  maxScore: number;
  passed: boolean;
  /** Nullable because session_log.ended_at is. */
  completedAt: string | null;
};

export type FeedbackOption = {
  answerId: string;
  optionText: string;
  explanation: string | null;
};

export type FeedbackResult = {
  questionId: string;
  correct: boolean;
  score: number;
  submittedAt: string;
  selectedOption: FeedbackOption;
  /** Null when the pick was correct — its own explanation is then the correct one. */
  correctOption: FeedbackOption | null;
};

/**
 * Discriminated instead of thrown, like AuthResult in lib/authClient.ts: callers have
 * to branch on status anyway (409 = no profile yet / already answered, 400 = question
 * bank too small), and an exception would make that read worse.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const NETWORK_ERROR = 'Could not reach the server. Please try again.';

async function request<T>(url: string, init: RequestInit, token: string): Promise<ApiResult<T>> {
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
    return { ok: false, status: response.status, error: body?.error || 'Something went wrong.' };
  }

  return { ok: true, data: body as T };
}

function postJson(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/**
 * Starts an activity — or picks up the one already running.
 *
 * There is deliberately no separate "resume" call: uq_session_log_one_active allows a
 * student one in-progress session per activity type, so the route answers 201 for a fresh
 * draw and 200 with resumed: true for the existing one. Both are success.
 */
export function startSession(token: string, activityType: ActivityType) {
  return request<StartSessionResult>('/api/sessions', postJson({ activityType }), token);
}

/**
 * Gives up a running session (REQ-PL-6.3's "Abandon"). The only way out of in-progress other
 * than answering every question — after this, POST /api/sessions draws a fresh set for the
 * same activity type instead of handing back the abandoned one.
 */
export function abandonSession(token: string, sessionId: string) {
  return request<{ session: SessionRecord }>(`/api/sessions/${sessionId}/abandon`, postJson({}), token);
}

/**
 * The running session with its questions and the answers given so far.
 * session: null (with a 200) means nothing is in progress — not an error.
 */
export function loadCurrentSession(token: string, activityType: ActivityType) {
  return request<CurrentSessionResult>(
    `/api/sessions/current?activityType=${encodeURIComponent(activityType)}`,
    { method: 'GET' },
    token,
  );
}

/**
 * The student's sessions in one status, across every activity type, newest started first.
 *
 * The cross-activity counterpart to loadCompletedAttempts: this one answers "what did I do
 * lately", that one "how did I do at this activity". Neither carries questions or answers.
 *
 * The 'completed' list is cached in localStorage (lib/completedSessionsStore.ts) keyed by
 * studentId, since it's the one status the dashboard actually asks for on every mount.
 * Pass studentId to opt into that cache; without it (or for 'in-progress'/'abandoned') this
 * always hits the network, unchanged. forceRefresh bypasses the cache and re-caches the
 * server's answer — the play flow does this once a session completes.
 */
export function loadSessions(
  token: string,
  status: 'in-progress' | 'completed' | 'abandoned',
  options: { studentId?: string; forceRefresh?: boolean } = {},
) {
  const { studentId, forceRefresh } = options;

  if (status === 'completed' && studentId && !forceRefresh) {
    const cached = getCachedCompletedSessions(studentId);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ sessions: SessionListEntry[] }>>({
        ok: true,
        data: { sessions: cached },
      });
    }
  }

  return request<{ sessions: SessionListEntry[] }>(
    `/api/sessions?status=${status}`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok && status === 'completed' && studentId) {
      setCachedCompletedSessions(studentId, result.data.sessions);
    }
    return result;
  });
}

/**
 * The student's finished attempts at one activity, newest first. An empty list is a normal
 * 200 — a student who has not completed anything yet simply has no history.
 */
export function loadCompletedAttempts(token: string, activityType: ActivityType) {
  return request<{ attempts: CompletedAttempt[] }>(
    `/api/sessions/completed?activityType=${encodeURIComponent(activityType)}`,
    { method: 'GET' },
    token,
  );
}

/**
 * The student's cumulative score: the sum of their best passing score at each difficulty level
 * of each activity type (REQ-GAM-DL-1). Cached in localStorage (lib/scoreStore.ts) keyed by
 * studentId, since it otherwise gets refetched on every AppShell mount i.e. every navigation.
 * A plain call is served from the cache when present; pass forceRefresh to bypass it and
 * re-cache the server's answer — the play flow does this once a session completes, since
 * that's the only thing that actually changes the score.
 *
 * studentId has to be the authenticated student; the route answers 403 for anyone else.
 */
export function loadStudentScore(
  token: string,
  studentId: string,
  options: { forceRefresh?: boolean } = {},
) {
  if (!options.forceRefresh) {
    const cached = getCachedScore(studentId);
    if (cached !== null) {
      return Promise.resolve<ApiResult<{ score: number }>>({ ok: true, data: { score: cached } });
    }
  }

  return request<{ score: number }>(
    `/api/students/${encodeURIComponent(studentId)}/score`,
    { method: 'GET' },
    token,
  ).then((result) => {
    if (result.ok) {
      setCachedScore(studentId, result.data.score);
    }
    return result;
  });
}

/**
 * Commits one answer. The score is decided by the server from the answer bank — it is
 * neither sent nor trusted from here.
 */
export function submitAnswer(
  token: string,
  sessionId: string,
  questionId: string,
  selectedOptionId: string,
) {
  return request<SubmitAnswerResult>(
    `/api/sessions/${sessionId}/answers`,
    postJson({ questionId, selectedOptionId }),
    token,
  );
}

/**
 * The explanations for an answer that has already been committed. Calling this before
 * submitAnswer returns 404 by design — otherwise it would be a way to test every option.
 */
export function loadFeedback(
  token: string,
  sessionId: string,
  questionId: string,
  selectedOptionId: string,
) {
  return request<FeedbackResult>(
    `/api/sessions/${sessionId}/feedback`,
    postJson({ questionId, selectedOptionId }),
    token,
  );
}
