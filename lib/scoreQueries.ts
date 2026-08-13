// Shared logic for computing a student's cumulative score from session history (REQ-GAM-DL-1),
// so the student-facing score route cannot drift from how the number is defined.

import type { SupabaseClient } from './sessionQueries';

export type SessionRow = { activity_type: string; difficulty_level: number; cumulative_score: number };

/**
 * Sum of the best cumulative_score at each (activity_type, difficulty_level) pair across a set
 * of completed sessions — REQ-GAM-DL-1's "for each difficulty level, find the highest score out
 * of the completed sessions, add this score to the accumulated total".
 *
 * Only a level's best attempt counts, so retaking one raises the total only by scoring higher;
 * a weaker retake changes nothing, and a level is never counted twice.
 *
 * Pulled out of computeStudentScore so lib/leaderboardQueries.ts's computeCourseLeaderboard can
 * reduce every enrolled student's rows through this exact function — the sidebar score pill and
 * a leaderboard row are provably the same number, not two implementations that happen to agree
 * today. Caller decides which rows belong to which student; this function only reduces one set.
 */
export function sumBestScores(sessions: SessionRow[]): number {
  const bestByKey = new Map<string, number>();
  for (const row of sessions) {
    const key = `${row.activity_type}:${row.difficulty_level}`;
    const current = bestByKey.get(key) ?? 0;
    if (row.cumulative_score > current) bestByKey.set(key, row.cumulative_score);
  }

  return [...bestByKey.values()].reduce((sum, value) => sum + value, 0);
}

/**
 * Sum of the student's best cumulative_score at each (activity_type, difficulty_level) pair,
 * counting every completed session (see sumBestScores for the reduction itself).
 *
 * Completed, not passed: an attempt that ended below the 75% threshold still earned its points
 * and contributes them. Only sessions that are still running or were abandoned stay out — their
 * cumulative_score is a partial tally of an attempt that was never finished.
 *
 * sessionsCompleted (GitHub #39) is the row count behind that same query — every completed
 * session counts once here, unlike the score sum, which only keeps each level's best attempt.
 * Returned alongside score rather than via a second query, since it's already the row set the
 * score is computed from.
 *
 * A student with no completed sessions gets score 0 and sessionsCompleted 0.
 */
export async function computeStudentScore(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('session_log')
    .select('activity_type, difficulty_level, cumulative_score')
    .eq('user_id', userId)
    .eq('status', 'completed');

  if (error) return { score: null, sessionsCompleted: null, error };

  const sessions = (data ?? []) as SessionRow[];

  return { score: sumBestScores(sessions), sessionsCompleted: sessions.length, error: null };
}
