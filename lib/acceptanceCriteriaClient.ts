"use client";

// GitHub #149: client for the "Write Acceptance Criteria" activity (REQ-FU-2). Same role as
// lib/sessionClient.ts for the Type A flow: the one place the UI talks to these two routes, so
// no component hand-rolls the Authorization header or picks apart an error body.

import type {
  AcceptanceCriteriaResult,
  UserStoryPrompt,
} from "./acceptanceCriteriaTypes";
import { toInstant } from "./dateTime";

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
 * GitHub #260: draws `count` *distinct* stories for a new local session
 * (lib/acceptanceCriteriaSessionStore.ts) — the Type A equivalent of the four questions
 * POST /api/sessions draws in one server-side call, but GET .../user-story has no batch or
 * exclude-list form, so this calls it repeatedly and de-duplicates client-side instead.
 *
 * Falls back to allowing a repeat once the retry budget is used up, rather than failing the
 * whole session, in case the story bank has fewer than `count` rows.
 */
export async function drawSessionStories(
  token: string,
  count: number,
): Promise<ApiResult<UserStoryPrompt[]>> {
  const stories: UserStoryPrompt[] = [];
  const seen = new Set<string>();
  const maxAttempts = count * 4;

  for (let attempt = 0; attempt < maxAttempts && stories.length < count; attempt++) {
    const result = await loadUserStory(token);
    if (!result.ok) return result;
    if (seen.has(result.data.userStoryId)) continue;
    seen.add(result.data.userStoryId);
    stories.push(result.data);
  }

  while (stories.length < count) {
    const result = await loadUserStory(token);
    if (!result.ok) return result;
    stories.push(result.data);
  }

  return { ok: true, data: stories };
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
