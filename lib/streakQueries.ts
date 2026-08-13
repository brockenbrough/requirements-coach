// Shared logic for computing a student's current daily streak from session history
// (REQ-GAM-BL-2, GitHub #307), so the student-facing streak route cannot drift from how the
// number is defined. Calculated at query time from session_log only (REQ-GAM-BL-2.2) — no new
// column, no new table — the same way computeStudentScore (lib/scoreQueries.ts) and
// computeStudentTitles (lib/titleQueries.ts) derive their numbers fresh on every call instead of
// keeping a second source of truth.
//
// V1 scope is Type-A activities only: the query reads session_log directly, so Write Acceptance
// Criteria (which has no session_log/passed concept — see CLAUDE.md's "half-connected worlds")
// is naturally excluded without needing an activity_type filter.

import { toInstant } from './dateTime';
import type { SupabaseClient } from './sessionQueries';

export type StreakSessionRow = { ended_at: string | null };

// 24h + 12h grace period (REQ-GAM-BL-2.3). Strictly greater-than breaks the streak, so a gap of
// exactly 36h — the worked example's "Monday 08:00 -> Tuesday 20:00" — still counts as held.
const GRACE_PERIOD_MS = 36 * 60 * 60 * 1000;

/** YYYY-MM-DD in UTC (REQ-GAM-BL-2.5) — the calendar-day key streak days are deduplicated by. */
function utcDateKey(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/**
 * Current streak length in days (REQ-GAM-BL-2.1) from a set of a single student's completed,
 * passed session_log rows — the number of consecutive calendar days (UTC) with at least one such
 * row, counting backward from the most recent passed activity for as long as the gap to the
 * next-older one stays within the 36h grace period (REQ-GAM-BL-2.3). An empty set gets 0.
 *
 * Walks every chronologically consecutive pair of passed activities, not precomputed day
 * boundaries: two activities on the same calendar day are always well under 24h apart, so they
 * can never trip the 36h check on their own, which means one pass over the sorted timestamps
 * handles both the grace-period break (REQ-GAM-BL-2.3) and the same-day dedup (REQ-GAM-BL-2.4)
 * — a Set of day keys only grows when a pair's gap is within the grace period, and duplicate
 * same-day keys collapse for free.
 *
 * Pulled out of computeStudentStreak the same way sumBestScores (lib/scoreQueries.ts) was pulled
 * out of computeStudentScore, so lib/leaderboardQueries.ts's computeCourseLeaderboard can reduce
 * every enrolled student's rows through this exact function instead of issuing one
 * computeStudentStreak query per row — a leaderboard flame and GET /api/students/{id}/streak's
 * own number are provably the same computation, not two implementations that happen to agree.
 * Caller decides which rows belong to which student and pre-filters to passed=true; this
 * function only reduces one already-filtered set.
 */
export function computeStreakFromSessions(rows: StreakSessionRow[]): number {
  // ended_at is nullable on the column, but every completed session_log row has one written at
  // completion time (see supabase/schema.sql) — filtered defensively rather than trusted blindly.
  const instants = rows
    .filter((row): row is { ended_at: string } => row.ended_at !== null)
    .map((row) => new Date(toInstant(row.ended_at)))
    .sort((a, b) => a.getTime() - b.getTime());

  if (instants.length === 0) return 0;

  const streakDays = new Set<string>([utcDateKey(instants[instants.length - 1])]);
  for (let i = instants.length - 1; i > 0; i--) {
    const gap = instants[i].getTime() - instants[i - 1].getTime();
    if (gap > GRACE_PERIOD_MS) break;
    streakDays.add(utcDateKey(instants[i - 1]));
  }

  return streakDays.size;
}

/**
 * Current streak length in days (REQ-GAM-BL-2.1) for one student (see computeStreakFromSessions
 * for the reduction itself). A student with no passed sessions gets a streak of 0.
 */
export async function computeStudentStreak(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('session_log')
    .select('ended_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .eq('passed', true)
    .order('ended_at', { ascending: true });

  if (error) return { currentStreak: null, error };

  return { currentStreak: computeStreakFromSessions((data ?? []) as StreakSessionRow[]), error: null };
}
