'use client';

// GitHub #347: real client for the quiz create/browse routes — same shape as lib/courseClient.ts.
// GitHub #359 added the catalog detail read (loadQuizDetail): a "quiz" here and a "question
// catalog" in that issue are the same activity_type-backed concept — see CLAUDE.md.

import type { CatalogQuestion } from './quizQuestionTypes';
import type { CatalogUserStory } from './llmActivityTypes';
import type { GradingKind } from './activityTypes';
import type { StoredTitleRung } from './titleAuthoringQueries';
import type { TitleLadderRungInput } from './titleLadderInput';

export type QuizSummary = {
  activityType: string;
  name: string;
  description: string | null;
  authorName: string;
  /** GitHub #379: 'mcq' (question/answer rows) or 'llm-graded' (free-text user_story prompts). */
  gradingKind: GradingKind;
  /** Questions for an 'mcq' catalog, prompts for an 'llm-graded' one — a catalog only ever fills
   *  one pool, so one field covers both. */
  questionCount: number;
  /** How many assembled quizzes (GitHub #360) currently reference this catalog — a catalog has no
   *  course of its own, so this is what the browse page shows instead. */
  quizCount: number;
};

export type QuizMeta = Omit<QuizSummary, 'questionCount' | 'quizCount'> & {
  /** The catalog's own custom grading rubric (activity_type.rating_prompt) — only ever meaningful
   *  for an llm-graded catalog; null for mcq or an llm-graded catalog that hasn't set one. */
  ratingPrompt: string | null;
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

/** Every catalog the calling instructor created (GET /api/instructor/quizzes). */
export function loadQuizzes(token: string): Promise<ApiResult<{ quizzes: QuizSummary[] }>> {
  return request<{ quizzes: QuizSummary[] }>('/api/instructor/quizzes', { method: 'GET' }, token);
}

/**
 * Creates a named question catalog, owned only by the creating instructor (POST /api/activities/types)
 * — a catalog has no course of its own; it becomes visible to students once composed into an
 * assembled_quiz (GitHub #360) for one. The stored key is derived server-side from name — never
 * sent by the caller — and reported back so the create form can show it if useful.
 *
 * GitHub #379: gradingKind is required here rather than optional-with-a-default, which is the
 * compile-time half of "creation cannot proceed without this choice" — the route enforces the
 * runtime half. It cannot be changed after creation, so there is no update counterpart.
 *
 * GitHub #379 follow-up: ratingPrompt is required by the route (not this type) when gradingKind is
 * 'llm-graded' — an instructor must set a catalog's grading rubric at creation time, same "locked
 * choice up front" reasoning as gradingKind itself, though unlike gradingKind the rubric text can
 * still be edited afterward (updateRatingPrompt below).
 */
export type CreatedQuiz = {
  activityType: string;
  name: string;
  description: string | null;
  gradingKind: GradingKind;
  ratingPrompt: string | null;
  /** The ladder as authored, only the levels that got a title — [] when none were given. */
  titles: StoredTitleRung[];
};

export function createQuiz(
  token: string,
  input: {
    name: string;
    gradingKind: GradingKind;
    description?: string;
    ratingPrompt?: string;
    /** Optional mastery title ladder. Omitted or empty creates a catalog with no titles, which is
     *  what every catalog created before this existed looks like. */
    titles?: TitleLadderRungInput[];
  },
): Promise<ApiResult<{ quiz: CreatedQuiz }>> {
  return request<{ quiz: CreatedQuiz }>(
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
 * One catalog's metadata plus its contents (GET /api/instructor/quizzes/{activityType},
 * GitHub #359) — not cached: the content changes any time the instructor edits it, so a client
 * cache would only make it easier to show a stale edit right after saving one.
 *
 * GitHub #379: both pools always come back, one of them empty — read quiz.gradingKind to know
 * which one is the real content.
 */
export type QuizDetail = {
  quiz: QuizMeta;
  questions: CatalogQuestion[];
  userStories: CatalogUserStory[];
  /** The catalog's mastery title ladder — only the levels that actually have a title, so an
   *  unauthored catalog sends []. */
  titles: StoredTitleRung[];
};

export function loadQuizDetail(token: string, activityType: string): Promise<ApiResult<QuizDetail>> {
  return request<QuizDetail>(
    `/api/instructor/quizzes/${encodeURIComponent(activityType)}`,
    { method: 'GET' },
    token,
  );
}

/**
 * Updates an llm-graded catalog's own grading rubric (PATCH /api/instructor/quizzes/{activityType},
 * GitHub #379 follow-up). 400s (surfaced as `error`) for an mcq catalog, since the field is only
 * ever meaningful for llm-graded ones.
 */
export function updateRatingPrompt(
  token: string,
  activityType: string,
  ratingPrompt: string,
): Promise<ApiResult<{ ratingPrompt: string | null }>> {
  return request<{ ratingPrompt: string | null }>(
    `/api/instructor/quizzes/${encodeURIComponent(activityType)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratingPrompt }),
    },
    token,
  );
}

/**
 * Replaces one catalog's mastery title ladder (PUT /api/instructor/quizzes/{activityType}/titles).
 *
 * A rung with titleName null clears that level; a level absent from `rungs` is left alone. The
 * response is the ladder as actually stored, not an echo — see the route for why.
 */
export function saveTitleLadder(
  token: string,
  activityType: string,
  rungs: TitleLadderRungInput[],
): Promise<ApiResult<{ titles: StoredTitleRung[] }>> {
  return request<{ titles: StoredTitleRung[] }>(
    `/api/instructor/quizzes/${encodeURIComponent(activityType)}/titles`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles: rungs }),
    },
    token,
  );
}

/** Every title name already in use anywhere, for the authoring form's suggestion list. */
export function loadTitleNames(token: string): Promise<ApiResult<{ titleNames: string[] }>> {
  return request<{ titleNames: string[] }>('/api/instructor/titles', { method: 'GET' }, token);
}

/**
 * Deletes a catalog and unlinks it from every assembled quiz it was composed into
 * (DELETE /api/instructor/quizzes/{activityType}). Refuses with a 409 (surfaced as `error`) if a
 * student has already engaged with it.
 */
export function deleteCatalog(token: string, activityType: string): Promise<ApiResult<{ activityType: string }>> {
  return request<{ activityType: string }>(
    `/api/instructor/quizzes/${encodeURIComponent(activityType)}`,
    { method: 'DELETE' },
    token,
  );
}
