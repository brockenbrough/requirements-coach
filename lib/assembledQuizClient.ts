'use client';

// GitHub #360: real client for the assembled-quiz create/browse routes — same shape as
// lib/quizClient.ts (catalogs) and lib/courseClient.ts (courses), the two other concepts this
// page's form combines.
// GitHub #361 added the composition-management routes (link/unlink a catalog, exclude/include a
// question, delete the quiz) — all nested under /api/instructor/assembled-quizzes/{quizId}/…
// rather than /api/instructor/quizzes/{id}/… (GitHub #359's catalog detail route already owns
// that path with a differently-named dynamic segment; Next.js can't have both).

import type { CatalogQuestion, QuizQuestion } from './quizQuestionTypes';
import type { CatalogUserStory } from './llmActivityTypes';
import type { UserStoryDraft } from './llmActivityClient';
import type { GradingKind } from './activityTypes';

export type AssembledQuizSummary = {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  courseName: string;
  /** The single catalog kind this quiz may ever compose/hand-pick from — locked at creation. */
  gradingKind: GradingKind;
  /** GitHub #416: how many questions/prompts a session draws per level for this quiz. */
  questionsPerLevel: number;
  catalogs: { activityType: string; name: string; gradingKind: GradingKind }[];
  catalogNames: string[];
  createdAt: string;
};

export type AssembledQuizDetail = {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  courseName: string;
  gradingKind: GradingKind;
  questionsPerLevel: number;
};

export type QuizCatalogComposition = {
  activityType: string;
  name: string;
  description: string | null;
  /** Which pool totalQuestions/activeCount are counted from — 'mcq' (question rows) or
   *  'llm-graded' (user_story rows). Both kinds support per-quiz exclusion. */
  gradingKind: GradingKind;
  /** The catalog's own grading rubric (activity_type.rating_prompt) — null for 'mcq', or for an
   *  'llm-graded' catalog that hasn't set one yet. Editable here (lib/quizClient.ts's
   *  updateRatingPrompt) when the catalog isn't built-in, and also from the catalog's own detail
   *  page. */
  ratingPrompt: string | null;
  totalQuestions: number;
  excludedCount: number;
  activeCount: number;
  /** GitHub #518/#519: true for one of the three seeded example catalogs — read-only, since PATCH
   *  /api/instructor/quizzes/{activityType} and its /titles sibling both reject any write for one. */
  isBuiltIn: boolean;
};

export type QuizLevelCoverage = { level: 1 | 2 | 3; available: number; required: number; sufficient: boolean };

/** One question in a quiz-scoped catalog view (GitHub #361) — a CatalogQuestion plus whether *this quiz* currently excludes it. */
export type QuizScopedQuestion = CatalogQuestion & { excludedForQuiz: boolean };

/** The llm-graded counterpart of QuizScopedQuestion — a CatalogUserStory plus whether *this quiz* currently excludes it. */
export type QuizScopedUserStory = CatalogUserStory & { excludedForQuiz: boolean };

/** One individually hand-picked question on a quiz (GitHub #380), with its source catalog for display. */
export type QuizExtraQuestionSummary = {
  questionId: string;
  questionText: string;
  level: 1 | 2 | 3;
  catalogActivityType: string;
  catalogName: string;
};

/** The llm-graded counterpart of QuizExtraQuestionSummary — one hand-picked prompt, with its source catalog for display. */
export type QuizExtraUserStorySummary = {
  userStoryId: string;
  storyText: string;
  level: 1 | 2 | 3;
  catalogActivityType: string;
  catalogName: string;
};

/** One question as the "Add individual questions" picker (GitHub #380) lists it, any catalog. */
export type PickableQuestion = {
  id: string;
  questionText: string;
  level: 1 | 2 | 3;
  catalogActivityType: string;
  catalogName: string;
};

/** The llm-graded counterpart of PickableQuestion — one prompt as the picker lists it, any catalog. */
export type PickableUserStory = {
  id: string;
  storyText: string;
  level: 1 | 2 | 3;
  catalogActivityType: string;
  catalogName: string;
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
 * (POST /api/instructor/assembled-quizzes). gradingKind is required and locked forever once set —
 * see assembled_quiz.grading_kind's own comment in supabase/schema.sql. questionsPerLevel (GitHub
 * #416) is optional — the route falls back to QUESTIONS_PER_SESSION when it's omitted.
 */
export type CreatedAssembledQuiz = {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  gradingKind: GradingKind;
  questionsPerLevel: number;
};

export function createAssembledQuiz(
  token: string,
  input: {
    name: string;
    description?: string;
    courseId: string;
    gradingKind: GradingKind;
    questionsPerLevel?: number;
    catalogActivityTypes: string[];
  },
): Promise<ApiResult<{ quiz: CreatedAssembledQuiz }>> {
  return request<{ quiz: CreatedAssembledQuiz }>('/api/instructor/assembled-quizzes', postJson(input), token);
}

function postJson(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

function quizPath(quizId: string, suffix = ''): string {
  return `/api/instructor/assembled-quizzes/${encodeURIComponent(quizId)}${suffix}`;
}

/**
 * One quiz's full composition (GET /api/instructor/assembled-quizzes/{quizId}, GitHub #361,
 * extended by GitHub #380 and by llm-graded parity) — meta, every linked catalog with its
 * genuinely-active question or prompt count, every individually hand-picked question and prompt,
 * and per-level coverage against the round size.
 */
export function loadQuizDetail(
  token: string,
  quizId: string,
): Promise<
  ApiResult<{
    quiz: AssembledQuizDetail;
    catalogs: QuizCatalogComposition[];
    levelCoverage: QuizLevelCoverage[];
    extraQuestions: QuizExtraQuestionSummary[];
    extraUserStories: QuizExtraUserStorySummary[];
    /** Bare ids behind `catalogs`' per-catalog counts — what AddQuizQuestionsModal marks as already in the quiz. */
    activeCatalogQuestionIds: string[];
    activeCatalogUserStoryIds: string[];
  }>
> {
  return request<{
    quiz: AssembledQuizDetail;
    catalogs: QuizCatalogComposition[];
    levelCoverage: QuizLevelCoverage[];
    extraQuestions: QuizExtraQuestionSummary[];
    extraUserStories: QuizExtraUserStorySummary[];
    activeCatalogQuestionIds: string[];
    activeCatalogUserStoryIds: string[];
  }>(quizPath(quizId), { method: 'GET' }, token);
}

/** Deletes the quiz (DELETE /api/instructor/assembled-quizzes/{quizId}, GitHub #361). The catalogs and their questions are untouched. */
export function deleteAssembledQuiz(token: string, quizId: string): Promise<ApiResult<{ quizId: string }>> {
  return request<{ quizId: string }>(quizPath(quizId), { method: 'DELETE' }, token);
}

/** Adds a catalog to the quiz's composition (POST /api/instructor/assembled-quizzes/{quizId}/catalogs, GitHub #361). */
export function linkCatalogToQuiz(token: string, quizId: string, activityType: string): Promise<ApiResult<{ activityType: string }>> {
  return request<{ activityType: string }>(quizPath(quizId, '/catalogs'), postJson({ activityType }), token);
}

/**
 * Removes a catalog from the quiz's composition
 * (DELETE /api/instructor/assembled-quizzes/{quizId}/catalogs/{activityType}, GitHub #361). The
 * catalog itself, and every question in it, are untouched — only the link is removed.
 */
export function unlinkCatalogFromQuiz(token: string, quizId: string, activityType: string): Promise<ApiResult<{ activityType: string }>> {
  return request<{ activityType: string }>(
    quizPath(quizId, `/catalogs/${encodeURIComponent(activityType)}`),
    { method: 'DELETE' },
    token,
  );
}

/** One linked catalog's own metadata, in the context of this quiz — the sibling of QuizMeta (lib/quizClient.ts) that also carries gradingKind. */
export type QuizScopedCatalogMeta = { activityType: string; name: string; description: string | null; authorName: string; gradingKind: GradingKind };

/**
 * One linked catalog's questions or prompts, in the context of this quiz
 * (GET /api/instructor/assembled-quizzes/{quizId}/catalogs/{activityType}, GitHub #361, extended
 * to llm-graded catalogs). Both pools are always present, one always empty, same "discriminated
 * by gradingKind, not by shape" convention lib/quizClient.ts's loadQuizDetail uses — each item is
 * annotated with whether *this quiz* currently excludes it, the same way for both kinds. Content
 * itself is read-only either way: editing/deleting happens only through the real catalog
 * (lib/quizClient.ts's loadQuizDetail, GitHub #359).
 */
export function loadQuizCatalogQuestions(
  token: string,
  quizId: string,
  activityType: string,
): Promise<ApiResult<{ catalog: QuizScopedCatalogMeta; questions: QuizScopedQuestion[]; userStories: QuizScopedUserStory[] }>> {
  return request<{ catalog: QuizScopedCatalogMeta; questions: QuizScopedQuestion[]; userStories: QuizScopedUserStory[] }>(
    quizPath(quizId, `/catalogs/${encodeURIComponent(activityType)}`),
    { method: 'GET' },
    token,
  );
}

/**
 * Excludes one question from this quiz's draw pool
 * (POST /api/instructor/assembled-quizzes/{quizId}/excluded-questions, GitHub #361). Never
 * touches the original question/answer rows — only this quiz's own exclusion list.
 */
export function excludeQuestionFromQuiz(token: string, quizId: string, questionId: string): Promise<ApiResult<{ questionId: string }>> {
  return request<{ questionId: string }>(quizPath(quizId, '/excluded-questions'), postJson({ questionId }), token);
}

/**
 * Re-includes a previously excluded question
 * (DELETE /api/instructor/assembled-quizzes/{quizId}/excluded-questions/{questionId}, GitHub #361).
 */
export function includeQuestionInQuiz(token: string, quizId: string, questionId: string): Promise<ApiResult<{ questionId: string }>> {
  return request<{ questionId: string }>(
    quizPath(quizId, `/excluded-questions/${encodeURIComponent(questionId)}`),
    { method: 'DELETE' },
    token,
  );
}

/**
 * Hand-picks one or more questions directly onto this quiz
 * (POST /api/instructor/assembled-quizzes/{quizId}/extra-questions, GitHub #380) — independent of
 * whether their catalogs are linked to the quiz at all. Returns the ids actually newly added
 * (already-picked ones are silently omitted, not an error).
 */
export function addExtraQuestionsToQuiz(token: string, quizId: string, questionIds: string[]): Promise<ApiResult<{ questionIds: string[] }>> {
  return request<{ questionIds: string[] }>(quizPath(quizId, '/extra-questions'), postJson({ questionIds }), token);
}

/**
 * Removes a hand-picked question from this quiz
 * (DELETE /api/instructor/assembled-quizzes/{quizId}/extra-questions/{questionId}, GitHub #380).
 * The original question row, its catalog, and every other quiz are untouched.
 */
export function removeExtraQuestionFromQuiz(token: string, quizId: string, questionId: string): Promise<ApiResult<{ questionId: string }>> {
  return request<{ questionId: string }>(
    quizPath(quizId, `/extra-questions/${encodeURIComponent(questionId)}`),
    { method: 'DELETE' },
    token,
  );
}

/**
 * Excludes one prompt from this quiz's draw pool
 * (POST /api/instructor/assembled-quizzes/{quizId}/excluded-user-stories) — the llm-graded
 * counterpart of excludeQuestionFromQuiz. Never touches the original user_story row.
 */
export function excludeUserStoryFromQuiz(token: string, quizId: string, userStoryId: string): Promise<ApiResult<{ userStoryId: string }>> {
  return request<{ userStoryId: string }>(quizPath(quizId, '/excluded-user-stories'), postJson({ userStoryId }), token);
}

/**
 * Re-includes a previously excluded prompt
 * (DELETE /api/instructor/assembled-quizzes/{quizId}/excluded-user-stories/{userStoryId}) — the
 * llm-graded counterpart of includeQuestionInQuiz.
 */
export function includeUserStoryInQuiz(token: string, quizId: string, userStoryId: string): Promise<ApiResult<{ userStoryId: string }>> {
  return request<{ userStoryId: string }>(
    quizPath(quizId, `/excluded-user-stories/${encodeURIComponent(userStoryId)}`),
    { method: 'DELETE' },
    token,
  );
}

/**
 * Hand-picks one or more prompts directly onto this quiz
 * (POST /api/instructor/assembled-quizzes/{quizId}/extra-user-stories) — the llm-graded
 * counterpart of addExtraQuestionsToQuiz, independent of whether their catalogs are linked to the
 * quiz at all. Returns the ids actually newly added (already-picked ones are silently omitted).
 */
export function addExtraUserStoriesToQuiz(token: string, quizId: string, userStoryIds: string[]): Promise<ApiResult<{ userStoryIds: string[] }>> {
  return request<{ userStoryIds: string[] }>(quizPath(quizId, '/extra-user-stories'), postJson({ userStoryIds }), token);
}

/**
 * Removes a hand-picked prompt from this quiz
 * (DELETE /api/instructor/assembled-quizzes/{quizId}/extra-user-stories/{userStoryId}) — the
 * llm-graded counterpart of removeExtraQuestionFromQuiz. The original user_story row, its
 * catalog, and every other quiz are untouched.
 */
export function removeExtraUserStoryFromQuiz(token: string, quizId: string, userStoryId: string): Promise<ApiResult<{ userStoryId: string }>> {
  return request<{ userStoryId: string }>(
    quizPath(quizId, `/extra-user-stories/${encodeURIComponent(userStoryId)}`),
    { method: 'DELETE' },
    token,
  );
}

/**
 * Every MCQ question and every llm-graded prompt the calling instructor created, any of their own
 * catalogs (GET /api/instructor/assembled-quizzes/questions, GitHub #380, extended with
 * llm-graded parity) — the pool the "Add individual questions" picker (AddQuizQuestionsModal)
 * searches/filters client-side, rendering the two kinds as separate sections. Not quiz-scoped;
 * the caller cross-references against a specific quiz's own already-loaded composition to mark
 * rows as already included.
 */
export function loadAllQuestionsForPicker(
  token: string,
): Promise<ApiResult<{ questions: PickableQuestion[]; userStories: PickableUserStory[] }>> {
  return request<{ questions: PickableQuestion[]; userStories: PickableUserStory[] }>(
    '/api/instructor/assembled-quizzes/questions',
    { method: 'GET' },
    token,
  );
}

/**
 * Creates a brand-new question AND hand-picks it onto this quiz in one atomic request
 * (POST /api/instructor/assembled-quizzes/{quizId}/questions, GitHub #380's "create new question"
 * extension) — the same body shape lib/sessionClient.ts's createQuestion sends, since both routes
 * share the same server-side validation (lib/questionAuthoringQueries.ts). question.explanation
 * only has anywhere to go on the correct answer, the same limitation createQuestion's own
 * answersPayload notes. Returns extraQuestion so the composition page can append it to local state
 * directly, without a full refetch.
 */
export function createAndPickQuestionForQuiz(
  token: string,
  quizId: string,
  question: QuizQuestion,
): Promise<ApiResult<{ questionId: string; answerIds: string[]; extraQuestion: QuizExtraQuestionSummary }>> {
  return request<{ questionId: string; answerIds: string[]; extraQuestion: QuizExtraQuestionSummary }>(
    quizPath(quizId, '/questions'),
    postJson({
      questionPrompt: question.questionText,
      activityType: question.quizType,
      difficultyLevel: question.level,
      answers: question.answerOptions.map((option) => ({
        optionText: option.text,
        isCorrect: option.isCorrect,
        ...(option.isCorrect ? { explanation: question.explanation } : {}),
      })),
    }),
    token,
  );
}

/**
 * Creates a brand-new prompt AND hand-picks it onto this quiz in one atomic request
 * (POST /api/instructor/assembled-quizzes/{quizId}/user-stories) — the llm-graded twin of
 * createAndPickQuestionForQuiz above. Returns extraUserStory so the composition page can append
 * it to local state directly, without a full refetch.
 */
export function createAndPickUserStoryForQuiz(
  token: string,
  quizId: string,
  prompt: UserStoryDraft,
): Promise<ApiResult<{ userStoryId: string; extraUserStory: QuizExtraUserStorySummary }>> {
  return request<{ userStoryId: string; extraUserStory: QuizExtraUserStorySummary }>(
    quizPath(quizId, '/user-stories'),
    postJson(prompt),
    token,
  );
}
