// Shared rules for Type A activities, so the session and answer routes cannot drift apart.

import type { Difficulty } from './activityContent';

// REQ-PL-2: students always start at the easy level; levels 2 and 3 are unlocked later.
export const START_DIFFICULTY_LEVEL = 1;
export const QUESTIONS_PER_SESSION = 4;

// GitHub #416: the hard floor for assembled_quiz.questions_per_level — a quiz's per-level draw
// size may never be set below this, enforced in the CHECK constraint
// (ck_assembled_quiz_questions_per_level, supabase/schema.sql), the create-quiz route, and the
// "Create Quiz" modal's own input. Deliberately its own named constant rather than a reuse of
// QUESTIONS_PER_SESSION even though the two currently share a value: this one is a business rule
// ("a quiz must always have at least this many questions per level"), that one is only today's
// default when an instructor doesn't set one — they're free to diverge later.
export const MIN_QUESTIONS_PER_LEVEL = 4;

// Fallback only for a question row whose max_score is genuinely NULL (legacy data) — every
// question created through createQuestionWithAnswers now gets mcqPointsForDifficulty's value
// instead, never this flat one.
export const DEFAULT_QUESTION_MAX_SCORE = 25;

/**
 * Points awarded for a fully-correct MCQ answer, by difficulty (Easy/Medium/Hard) — task-type-
 * and-difficulty rewards for the MCQ side. Written onto question.max_score at creation time
 * (lib/questionAuthoringQueries.ts), not looked up per-answer, so scoreForAnswer below needs no
 * changes: it already reads whatever max_score the question was created with, and the session
 * max_score sum in POST /api/sessions already reduces over that same column.
 */
export const MCQ_POINTS_BY_DIFFICULTY: Record<Difficulty, number> = { 1: 10, 2: 20, 3: 30 };

export function mcqPointsForDifficulty(level: Difficulty): number {
  return MCQ_POINTS_BY_DIFFICULTY[level];
}

// Mirrors ck_question_difficulty_level / ck_user_story_difficulty_level (supabase/schema.sql):
// levels run 1-3 across the whole schema.
export const MAX_DIFFICULTY_LEVEL = 3;

// "If the student has a cumulative score of 75% on the questions, then the student can
// advance to the next level of difficulty." (docs/requirements/requirements.md)
export const PASS_RATIO = 0.75;

export const SESSION_COLUMNS =
  'session_id, user_id, activity_type, assembled_quiz_id, difficulty_level, started_at, ended_at, status, cumulative_score, max_score, passed';

// Mirrors ck_session_log_status in supabase/schema.sql.
export const SESSION_STATUSES = ['in-progress', 'completed', 'abandoned'] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export function isSessionStatus(value: unknown): value is SessionStatus {
  return typeof value === 'string' && (SESSION_STATUSES as readonly string[]).includes(value);
}

export function isPassing(cumulativeScore: number, maxScore: number): boolean {
  if (maxScore <= 0) return false;
  return cumulativeScore >= maxScore * PASS_RATIO;
}

/**
 * Points awarded for a submitted option.
 *
 * Interim rule: all or nothing. REQ-DL-2.1 asks for partial credit per option ("the other
 * answers can receive partial points"), but the answer table has no score column yet — see
 * supabase/schema.sql. Once it does, this becomes `return option.score;` and nothing else
 * in the routes has to change.
 */
export function scoreForAnswer(isCorrect: boolean, questionMaxScore: number | null): number {
  return isCorrect ? questionMaxScore ?? DEFAULT_QUESTION_MAX_SCORE : 0;
}

export type PassedSessionRow = { activity_type: string; difficulty_level: number; passed: boolean };

/**
 * Reduces session_log rows to the highest difficulty_level passed, per activity_type. Pure so it
 * can be shared between computeStudentTitles (lib/titleQueries.ts, unscoped — every activity type
 * a student has touched) and the session-start route's per-activity-type lookup
 * (lib/sessionQueries.ts's findStartDifficultyLevel), instead of two copies of the same reduction
 * drifting apart.
 */
export function highestPassedLevelByType(sessions: readonly PassedSessionRow[]): Map<string, number> {
  const highestPassed = new Map<string, number>();
  for (const row of sessions) {
    if (!row.passed) continue;
    const current = highestPassed.get(row.activity_type) ?? 0;
    if (row.difficulty_level > current) highestPassed.set(row.activity_type, row.difficulty_level);
  }
  return highestPassed;
}

/**
 * The difficulty level a new session for one activity should start at, given the highest level
 * already passed (null if none has been). One level past that, capped at MAX_DIFFICULTY_LEVEL.
 * Shared by the session-start route (lib/sessionQueries.ts's findStartDifficultyLevel) and the
 * activity list's level display (app/activities/page.tsx), so the two can't disagree about what
 * "next level" means.
 */
export function nextDifficultyLevel(highestPassedLevel: number | null): number {
  return highestPassedLevel === null
    ? START_DIFFICULTY_LEVEL
    : Math.min(highestPassedLevel + 1, MAX_DIFFICULTY_LEVEL);
}
