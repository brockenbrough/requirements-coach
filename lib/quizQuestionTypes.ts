import type { ActivityType } from './activityTypes';

export type QuizAnswerOption = {
  id: string;
  text: string;
  isCorrect: boolean;
};

/**
 * One question as the Instructor's "Add Question" form (GitHub #120) creates it, and as
 * GET /api/instructor/questions (GitHub #170) returns it. Deliberately its own shape rather
 * than lib/activityContent.ts's Question/AnswerOption (built for the legacy student-facing
 * mock, with a fixed 25-point maxScore and a per-option explanation baked in) — this one is
 * what the real question-bank endpoints accept and return; QuestionFormModal, AnswerOptionField
 * and app/instructor/questions/page.tsx don't need to change shape around it.
 */
export type QuizQuestion = {
  id: string;
  quizType: ActivityType;
  level: 1 | 2 | 3;
  questionText: string;
  /** Exactly one entry has isCorrect: true — single-choice, per REQ-PL-6.4. */
  answerOptions: QuizAnswerOption[];
  /** Shown to the student when they answer incorrectly. */
  explanation: string;
};

/**
 * GitHub #359: a QuizQuestion as the catalog detail view returns it — every question in one
 * activity_type ("catalog"/"quiz"), not just the caller's own, since catalogs are shared
 * (lib/activityTypeQueries.ts's listQuizzesWithAuthorAndCount). ownerId is null for the seeded
 * bank the same way question.user_id already is; the catalog page uses it to decide whether the
 * Edit/Delete icons render for a given row — PATCH/DELETE /api/instructor/questions/{id} both
 * 403 a non-owner server-side regardless, this is purely so the UI doesn't offer a button that
 * can only fail.
 */
export type CatalogQuestion = QuizQuestion & { ownerId: string | null };
