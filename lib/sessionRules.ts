// Shared rules for Type A activities, so the session and answer routes cannot drift apart.

// REQ-PL-2: students always start at the easy level; levels 2 and 3 are unlocked later.
export const START_DIFFICULTY_LEVEL = 1;
export const QUESTIONS_PER_SESSION = 4;
export const DEFAULT_QUESTION_MAX_SCORE = 25;

// Mirrors ck_question_difficulty_level / ck_user_story_difficulty_level (supabase/schema.sql):
// levels run 1-3 across the whole schema.
export const MAX_DIFFICULTY_LEVEL = 3;

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
