// Shared logic for computing a student's cumulative score from session history (REQ-GAM-DL-1),
// so the student-facing score route cannot drift from how the number is defined.

import type { SupabaseClient } from './sessionQueries';

export type SessionRow = {
  activity_type: string;
  difficulty_level: number;
  cumulative_score: number;
  /** GitHub #583: which assembled_quiz this session was started through, if known. */
  assembled_quiz_id?: string | null;
};

/**
 * Sum of the best cumulative_score at each (assembled_quiz_id, activity_type, difficulty_level)
 * key across a set of completed sessions — REQ-GAM-DL-1's "for each difficulty level, find the
 * highest score out of the completed sessions, add this score to the accumulated total".
 *
 * Only a level's best attempt counts, so retaking one raises the total only by scoring higher;
 * a weaker retake changes nothing, and a level is never counted twice — but two different quizzes
 * built on the same catalog now each get their own key (GitHub #583, confirmed product decision:
 * completing both is two distinct assignments, not one deduplicated best-of), rather than
 * silently sharing one (activity_type, difficulty_level) slot and having a weaker attempt on one
 * quiz get overwritten by a stronger one on the other. Rows with no assembled_quiz_id (legacy, or
 * a bare/bookmarked link with no quiz context) fall into one shared 'none' bucket per
 * (activity_type, difficulty_level), matching the exact pre-#583 behavior for that population.
 *
 * Pulled out of computeStudentScore so lib/leaderboardQueries.ts's computeCourseLeaderboard can
 * reduce every enrolled student's rows through this exact function — the sidebar score pill and
 * a leaderboard row are provably the same number, not two implementations that happen to agree
 * today. Caller decides which rows belong to which student; this function only reduces one set.
 */
export function sumBestScores(sessions: SessionRow[]): number {
  const bestByKey = new Map<string, number>();
  for (const row of sessions) {
    const key = `${row.assembled_quiz_id ?? 'none'}:${row.activity_type}:${row.difficulty_level}`;
    const current = bestByKey.get(key) ?? 0;
    if (row.cumulative_score > current) bestByKey.set(key, row.cumulative_score);
  }

  return [...bestByKey.values()].reduce((sum, value) => sum + value, 0);
}

/**
 * Sum of the student's best cumulative_score at each (activity_type, difficulty_level) pair,
 * counting every completed session (see sumBestScores for the reduction itself), plus every
 * Daily Challenge attempt's own (already-doubled, see lib/dailyChallengeRules.ts) score.
 *
 * Completed, not passed: an attempt that ended below the 75% threshold still earned its points
 * and contributes them. Only sessions that are still running or were abandoned stay out — their
 * cumulative_score is a partial tally of an attempt that was never finished.
 *
 * The Daily Challenge side is a plain sum, not a sumBestScores-style reduction: unlike a session,
 * a daily_challenge_attempt doesn't have an (activity_type, difficulty_level) key to dedupe on —
 * uq_daily_challenge_attempt_user_date already caps the table at one row per user per calendar
 * day, so every submitted attempt is a distinct day's points and all of them count. A `score` of
 * `null` (never submitted, or the deadline passed first) contributes 0, the same "unfinished
 * attempt earns nothing yet" rule sessions follow.
 *
 * sessionsCompleted (GitHub #39) is the row count behind the session_log query only — every
 * completed session counts once here, unlike the score sum, which only keeps each level's best
 * attempt. Daily Challenge attempts are not sessions and don't affect this count. Returned
 * alongside score rather than via a second query, since it's already the row set the score is
 * computed from.
 *
 * A student with no completed sessions and no Daily Challenge attempts gets score 0 and
 * sessionsCompleted 0.
 */
export async function computeStudentScore(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('session_log')
    .select('activity_type, difficulty_level, cumulative_score, assembled_quiz_id')
    .eq('user_id', userId)
    .eq('status', 'completed');

  if (error) return { score: null, sessionsCompleted: null, error };

  const sessions = (data ?? []) as SessionRow[];

  const { data: dailyChallengeData, error: dailyChallengeError } = await supabase
    .from('daily_challenge_attempt')
    .select('score')
    .eq('user_id', userId);

  if (dailyChallengeError) return { score: null, sessionsCompleted: null, error: dailyChallengeError };

  const dailyChallengeScore = ((dailyChallengeData ?? []) as { score: number | null }[]).reduce(
    (sum, row) => sum + (row.score ?? 0),
    0,
  );

  return { score: sumBestScores(sessions) + dailyChallengeScore, sessionsCompleted: sessions.length, error: null };
}
