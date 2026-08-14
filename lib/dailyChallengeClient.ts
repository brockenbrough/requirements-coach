'use client';

// The UI's one gateway to the Daily Challenge routes (GitHub #337) — same role
// lib/sessionClient.ts plays for the MCQ session routes. request()/postJson() are copied rather
// than imported from sessionClient.ts (both are private to that file) — the same
// per-file-duplication precedent already accepted for getToken across the API routes.

import type { ApiResult } from './sessionClient';
import type { DailyChallengeAnswerResult, DailyChallengeState } from './dailyChallengeTypes';

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

function postJson(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/** Today's state — a pure read, never draws or starts anything (GET /api/daily-challenge). */
export function loadDailyChallenge(token: string) {
  return request<DailyChallengeState>('/api/daily-challenge', { method: 'GET' }, token);
}

/**
 * Starts today's Daily Challenge, or returns the one already drawn — idempotent, same as
 * startSession (lib/sessionClient.ts). No body: the route derives everything from the token.
 */
export function startDailyChallenge(token: string) {
  return request<DailyChallengeState>('/api/daily-challenge', { method: 'POST' }, token);
}

/** Submits an answer for one attempt and reveals the result in the same round trip. */
export function submitDailyChallengeAnswer(token: string, attemptId: string, selectedOptionId: string) {
  return request<DailyChallengeAnswerResult>(
    `/api/daily-challenge/${attemptId}/answers`,
    postJson({ selectedOptionId }),
    token,
  );
}
