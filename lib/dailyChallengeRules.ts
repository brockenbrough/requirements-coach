// Shared rules for the Daily Challenge (GitHub #337), so the daily-challenge and its answers
// route cannot drift apart — mirrors the role lib/sessionRules.ts plays for Type A sessions.

import { toInstant } from './dateTime';
import { scoreForAnswer } from './sessionRules';

// Placeholder — neither the issue nor docs/requirements/requirements.md's "Daily Challenges"
// entry names a specific duration. Easy to tune; nothing else depends on this exact number.
export const TIME_LIMIT_SECONDS = 60;

// "award double points" (GitHub #337).
export const SCORE_MULTIPLIER = 2;

export const DAILY_CHALLENGE_COLUMNS =
  'daily_challenge_attempt_id, user_id, question_id, challenge_date, started_at, deadline_at, submitted_option, is_correct, score, submitted_at';

/** All-or-nothing like scoreForAnswer, just doubled — "award double points" (GitHub #337). */
export function scoreForDailyChallenge(isCorrect: boolean, questionMaxScore: number | null): number {
  return scoreForAnswer(isCorrect, questionMaxScore) * SCORE_MULTIPLIER;
}

/**
 * Whether the time limit has passed. deadline_at comes back from PostgREST zone-less (see
 * lib/dateTime.ts), so it is routed through toInstant before comparing against `now`.
 */
export function isExpired(deadlineAt: string, now: Date = new Date()): boolean {
  return now.getTime() > new Date(toInstant(deadlineAt)).getTime();
}
