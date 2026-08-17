'use client';

// GitHub #360: real client for the assembled-quiz create/browse routes — same shape as
// lib/quizClient.ts (catalogs) and lib/courseClient.ts (courses), the two other concepts this
// page's form combines.
// GitHub #361 added the composition-management routes (link/unlink a catalog, exclude/include a
// question, delete the quiz) — all nested under /api/instructor/assembled-quizzes/{quizId}/…
// rather than /api/instructor/quizzes/{id}/… (GitHub #359's catalog detail route already owns
// that path with a differently-named dynamic segment; Next.js can't have both).

import type { CatalogQuestion, QuizQuestion } from './quizQuestionTypes';

export type AssembledQuizSummary = {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  courseName: string;
  catalogs: { activityType: string; name: string }[];
  catalogNames: string[];
  createdAt: string;
};

export type AssembledQuizDetail = {
  id: string;
  name: string;
  description: string | null;
  courseId: string;
  courseName: string;
};

export type QuizCatalogComposition = {
  activityType: string;
  name: string;
  description: string | null;
  totalQuestions: number;
  excludedCount: number;
  activeCount: number;
};

export type QuizLevelCoverage = { level: 1 | 2 | 3; available: number; required: number; sufficient: boolean };

/** One question in a quiz-scoped catalog view (GitHub #361) — a CatalogQuestion plus whether *this quiz* currently excludes it. */
export type QuizScopedQuestion = CatalogQuestion & { excludedForQuiz: boolean };

/** One individually hand-picked question on a quiz (GitHub #380), with its source catalog for display. */
export type QuizExtraQuestionSummary = {
  questionId: string;
  questionText: string;
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
    postJson(input),
    token,
  );
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
 * extended by GitHub #380) — meta, every linked catalog with its genuinely-active question count,
 * every individually hand-picked question, and per-level coverage against the round size.
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
    /** Bare ids behind `catalogs`' per-catalog counts — what AddQuizQuestionsModal marks as already in the quiz. */
    activeCatalogQuestionIds: string[];
  }>
> {
  return request<{
    quiz: AssembledQuizDetail;
    catalogs: QuizCatalogComposition[];
    levelCoverage: QuizLevelCoverage[];
    extraQuestions: QuizExtraQuestionSummary[];
    activeCatalogQuestionIds: string[];
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

/**
 * One linked catalog's questions, in the context of this quiz
 * (GET /api/instructor/assembled-quizzes/{quizId}/catalogs/{activityType}, GitHub #361) — each
 * annotated with whether this quiz currently excludes it. Read-only: editing/deleting a question
 * happens only through the real catalog (lib/quizClient.ts's loadQuizDetail, GitHub #359).
 */
export function loadQuizCatalogQuestions(
  token: string,
  quizId: string,
  activityType: string,
): Promise<ApiResult<{ catalog: { activityType: string; name: string; description: string | null; authorName: string }; questions: QuizScopedQuestion[] }>> {
  return request<{ catalog: { activityType: string; name: string; description: string | null; authorName: string }; questions: QuizScopedQuestion[] }>(
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
 * Every MCQ question in the system, any author, any catalog
 * (GET /api/instructor/assembled-quizzes/questions, GitHub #380) — the pool the "Add individual
 * questions" picker (AddQuizQuestionsModal) searches/filters client-side. Not quiz-scoped; the
 * caller cross-references against a specific quiz's own already-loaded composition to mark rows
 * as already included.
 */
export function loadAllQuestionsForPicker(token: string): Promise<ApiResult<{ questions: PickableQuestion[] }>> {
  return request<{ questions: PickableQuestion[] }>('/api/instructor/assembled-quizzes/questions', { method: 'GET' }, token);
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
