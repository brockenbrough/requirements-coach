// Query for the real course leaderboard (GET /api/courses/{courseId}/leaderboard), the
// leaderboard page and dashboard preview's data source. See lib/scoreQueries.ts's sumBestScores
// and lib/streakQueries.ts's computeStreakFromSessions,
// both reused here so a leaderboard row can never disagree with the sidebar score pill or
// GET /api/students/{id}/streak about what "points" or "streak" mean.

import type { SupabaseClient } from './sessionQueries';
import { sumBestScores, type SessionRow } from './scoreQueries';
import { computeStreakFromSessions, type StreakSessionRow } from './streakQueries';

// Aliased to `student`, same convention as lib/sessionQueries.ts's STUDENT_EMBED, because the
// table is called "user" (a reserved word). !inner matters here exactly the way it does there:
// without it, .eq('student.role', 'student') would null the embed instead of dropping the row,
// and an instructor who was somehow enrolled would still show up ranked among their own
// students. Backed by ix_user_role, the same index that embed relies on.
const ROSTER_STUDENT_EMBED = 'student:user!inner(username, avatar_url, role)';

type RosterRow = {
  user_id: string;
  student: { username: string; avatar_url: string | null; role: string };
};

/** One ranked row. No rankChange here — that's derived client-side, see LeaderboardEntry's own doc. */
export type LeaderboardRow = {
  rank: number;
  studentId: string;
  username: string;
  avatarUrl: string | null;
  points: number;
  /** Same definition as computeStudentStreak (lib/streakQueries.ts, GitHub #307). */
  streak: number;
};

/**
 * One course's leaderboard: every enrolled student, ranked by cumulative score.
 *
 * The roster comes from student_course, not from who has completed something — a student with
 * zero completed sessions still appears, at 0 points, which is the opposite of
 * loadAllStudentActivity's known "roster derived from attempts" gap (see CLAUDE.md). Only
 * username and avatar_url leave "user": a leaderboard is visible to every other student enrolled
 * in the course, not just the one row it's about, so it gets the same privacy boundary as
 * lib/leaderboardTypes.ts's PublicStudentProfile — never first_name/last_name/age/semester.
 *
 * Two queries, merged in JS, the same shape listJoinableCourses (lib/courseQueries.ts) already
 * uses: the roster first, then every completed session_log row for that whole roster in one
 * .in() call, rather than one session_log query per student — and rather than a second .in()
 * query for streak, the same row set is reused for both: sumBestScores reduces it into points
 * exactly the way computeStudentScore reduces a single student's, and the passed=true subset is
 * reduced by computeStreakFromSessions exactly the way computeStudentStreak reduces a single
 * student's. Neither number can drift from its single-student counterpart.
 *
 * Standard competition ranking on points (ties share a rank, the next rank skips: 1, 2, 2, 4),
 * with username as the deterministic secondary sort — two requests can't disagree about who's
 * ahead on a tie the way an unstable sort could.
 *
 * Returns { data, error } like every other *Queries.ts function; data is null only on a query
 * failure, never on an empty-but-real result (a roster with no enrolled students is data: []).
 */
export async function computeCourseLeaderboard(
  supabase: SupabaseClient,
  courseId: string,
): Promise<{ data: LeaderboardRow[] | null; error: { message: string } | null }> {
  const { data: rosterData, error: rosterError } = await supabase
    .from('student_course')
    .select(`user_id, ${ROSTER_STUDENT_EMBED}`)
    .eq('course_id', courseId)
    .eq('student.role', 'student');

  if (rosterError) return { data: null, error: rosterError };

  const roster = (rosterData ?? []) as unknown as RosterRow[];
  if (roster.length === 0) return { data: [], error: null };

  const studentIds = roster.map((row) => row.user_id);

  const { data: sessionData, error: sessionError } = await supabase
    .from('session_log')
    .select('user_id, activity_type, difficulty_level, cumulative_score, ended_at, passed')
    .in('user_id', studentIds)
    .eq('status', 'completed');

  if (sessionError) return { data: null, error: sessionError };

  type CombinedRow = SessionRow & StreakSessionRow & { user_id: string; passed: boolean };

  const sessionsByStudent = new Map<string, CombinedRow[]>();
  for (const row of (sessionData ?? []) as CombinedRow[]) {
    const list = sessionsByStudent.get(row.user_id) ?? [];
    list.push(row);
    sessionsByStudent.set(row.user_id, list);
  }

  const unranked = roster
    .map((row) => {
      const sessions = sessionsByStudent.get(row.user_id) ?? [];
      return {
        studentId: row.user_id,
        username: row.student.username,
        avatarUrl: row.student.avatar_url,
        points: sumBestScores(sessions),
        streak: computeStreakFromSessions(sessions.filter((session) => session.passed)),
      };
    })
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));

  const data: LeaderboardRow[] = [];
  let previousPoints: number | null = null;
  let previousRank = 0;

  unranked.forEach((entry, index) => {
    const rank = entry.points === previousPoints ? previousRank : index + 1;
    data.push({
      rank,
      studentId: entry.studentId,
      username: entry.username,
      avatarUrl: entry.avatarUrl,
      points: entry.points,
      streak: entry.streak,
    });
    previousPoints = entry.points;
    previousRank = rank;
  });

  return { data, error: null };
}
