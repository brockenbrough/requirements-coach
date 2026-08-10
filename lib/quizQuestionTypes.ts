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
