"use client";

// GitHub #149: client for the "Write Acceptance Criteria" activity (REQ-FU-2). Same role as
// lib/sessionClient.ts for the Type A flow: the one place the UI talks to these two routes, so
// no component hand-rolls the Authorization header or picks apart an error body.

import type {
  AcceptanceCriteriaResult,
  UserStoryPrompt,
} from "./acceptanceCriteriaTypes";

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

/** GET .../user-story: draws one random story for the student to write criteria for. */
export function loadUserStory(
  token: string,
): Promise<ApiResult<UserStoryPrompt>> {
  return request<UserStoryPrompt>(
    "/api/activities/write-acceptance-criteria/user-story",
    { method: "GET" },
    token,
  );
}

/**
 * POST .../submissions: commits the answer, then returns the LLM's grading of it.
 *
 * The route does not echo submittedText back — it is folded in here from what was actually
 * sent, so the feedback screen can show the student's own answer without a second round trip.
 */
export async function submitAcceptanceCriteria(
  token: string,
  userStoryId: string,
  submittedText: string,
): Promise<ApiResult<AcceptanceCriteriaResult>> {
  const result = await request<{
    submissionId: string;
    score: number;
    feedback: string;
  }>(
    "/api/activities/write-acceptance-criteria/submissions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userStoryId, submittedText }),
    },
    token,
  );

  if (!result.ok) return result;

  return { ok: true, data: { ...result.data, submittedText } };
}
