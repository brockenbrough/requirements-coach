// Shared rules for Type A activities, so the session and answer routes cannot drift apart.

// REQ-PL-2: students always start at the easy level; levels 2 and 3 are unlocked later.
export const START_DIFFICULTY_LEVEL = 1;
export const QUESTIONS_PER_SESSION = 4;
export const DEFAULT_QUESTION_MAX_SCORE = 25;

// "If the student has a cumulative score of 75% on the questions, then the student can
// advance to the next level of difficulty." (docs/requirements/requirements.md)
export const PASS_RATIO = 0.75;

export const SESSION_COLUMNS =
  'session_id, user_id, activity_type, difficulty_level, started_at, ended_at, status, cumulative_score, max_score, passed, badge_id';

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
