'use client';

// GitHub #360: real client for the assembled-quiz create/browse routes — same shape as
// lib/quizClient.ts (catalogs) and lib/courseClient.ts (courses), the two other concepts this
// page's form combines.

export type AssembledQuizSummary = {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  courseName: string;
  catalogNames: string[];
  createdAt: string;
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

/** Every assembled quiz the calling instructor created (GET /api/instructor/assembled-quizzes). */
export function loadAssembledQuizzes(token: string): Promise<ApiResult<{ quizzes: AssembledQuizSummary[] }>> {
  return request<{ quizzes: AssembledQuizSummary[] }>('/api/instructor/assembled-quizzes', { method: 'GET' }, token);
}

/**
 * Composes a quiz from one or more catalogs for one of the caller's own courses
 * (POST /api/instructor/assembled-quizzes).
 */
export function createAssembledQuiz(
  token: string,
  input: { name: string; description?: string; courseId: string; catalogActivityTypes: string[] },
): Promise<ApiResult<{ quiz: { id: string; name: string; description: string | null; courseId: string } }>> {
  return request<{ quiz: { id: string; name: string; description: string | null; courseId: string } }>(
    '/api/instructor/assembled-quizzes',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    token,
  );
}
