'use client';

// GitHub #347: real client for the quiz create/browse routes — same shape as lib/courseClient.ts.
// GitHub #359 added the catalog detail read (loadQuizDetail): a "quiz" here and a "question
// catalog" in that issue are the same activity_type-backed concept — see CLAUDE.md.

import type { CatalogQuestion } from './quizQuestionTypes';

export type QuizSummary = {
  activityType: string;
  name: string;
  description: string | null;
  authorName: string;
  questionCount: number;
  /** How many assembled quizzes (GitHub #360) currently reference this catalog — a catalog has no
   *  course of its own, so this is what the browse page shows instead. */
  quizCount: number;
};

export type QuizMeta = Omit<QuizSummary, 'questionCount' | 'quizCount'>;

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
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, error: body?.error || 'Something went wrong.' };
  }

  return { ok: true, data: body as T };
}

/** Every quiz in the system, built-in or instructor-created (GET /api/instructor/quizzes). */
export function loadQuizzes(token: string): Promise<ApiResult<{ quizzes: QuizSummary[] }>> {
  return request<{ quizzes: QuizSummary[] }>('/api/instructor/quizzes', { method: 'GET' }, token);
}

/**
 * Creates a named question catalog, owned only by the creating instructor (POST /api/activities/types)
 * — a catalog has no course of its own; it becomes visible to students once composed into an
 * assembled_quiz (GitHub #360) for one. The stored key is derived server-side from name — never
 * sent by the caller — and reported back so the create form can show it if useful.
 */
export function createQuiz(
  token: string,
  input: { name: string; description?: string },
): Promise<ApiResult<{ quiz: { activityType: string; name: string; description: string | null } }>> {
  return request<{ quiz: { activityType: string; name: string; description: string | null } }>(
    '/api/activities/types',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    token,
  );
}

/**
 * One catalog's metadata plus every question it contains (GET /api/instructor/quizzes/{activityType},
 * GitHub #359) — not cached, same reasoning as loadPublicStudentProfile: the data is shared across
 * authors, so a per-instructor client cache would only make it easier to show a colleague's stale
 * edit.
 */
export function loadQuizDetail(
  token: string,
  activityType: string,
): Promise<ApiResult<{ quiz: QuizMeta; questions: CatalogQuestion[] }>> {
  return request<{ quiz: QuizMeta; questions: CatalogQuestion[] }>(
    `/api/instructor/quizzes/${encodeURIComponent(activityType)}`,
    { method: 'GET' },
    token,
  );
}
