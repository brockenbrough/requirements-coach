// Shared logic for computing a student's cumulative score from session history (REQ-GAM-DL-1),
// so the student-facing score route cannot drift from how the number is defined.

import type { SupabaseClient } from './sessionQueries';

type SessionRow = { activity_type: string; difficulty_level: number; cumulative_score: number };

/**
 * Sum of the best passing score at each (activity_type, difficulty_level) pair for the student.
 * Retaking a level and scoring higher raises the total; a session that was not passed never
 * contributes. A student with no passing sessions gets 0.
 */
export async function computeStudentScore(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('session_log')
    .select('activity_type, difficulty_level, cumulative_score')
    .eq('user_id', userId)
    .eq('passed', true);

  if (error) return { score: null, error };

  const bestByKey = new Map<string, number>();
  for (const row of (data ?? []) as SessionRow[]) {
    const key = `${row.activity_type}:${row.difficulty_level}`;
    const current = bestByKey.get(key) ?? 0;
    if (row.cumulative_score > current) bestByKey.set(key, row.cumulative_score);
  }

  const score = [...bestByKey.values()].reduce((sum, value) => sum + value, 0);

  return { score, error: null };
}
