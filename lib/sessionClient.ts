'use client';

// Single place where the UI talks to the session API routes, in the same spirit as
// lib/authClient.ts for the auth routes: no page hand-rolls the Authorization header
// or picks apart an error body.
//
// The shapes below mirror what the routes actually return — notably, a question
// carries its options *without* is_correct or explanation. Those only ever arrive
// from the feedback route, and only after the answer has been committed.

import type { ActivityType } from './activityTypes';

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

export type SubmitAnswerResult = {
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
