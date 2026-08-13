'use client';

// GitHub #347: real client for the quiz create/browse routes — same shape as lib/courseClient.ts.

export type QuizSummary = {
  activityType: string;
  name: string;
  description: string | null;
  authorName: string;
  questionCount: number;
};

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
 * Creates a named quiz (POST /api/activities/types). The stored key is derived server-side from
 * name — never sent by the caller — and reported back so the create form can show it if useful.
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
