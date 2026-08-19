// Query for the real course leaderboard (GET /api/courses/{courseId}/leaderboard), the
// leaderboard page and dashboard preview's data source. See lib/scoreQueries.ts's sumBestScores
// and lib/streakQueries.ts's computeStreakFromSessions,
// both reused here so a leaderboard row can never disagree with the sidebar score pill or
// GET /api/students/{id}/streak about what "points" or "streak" mean.

import type { SupabaseClient } from './sessionQueries';
import { sumBestScores, type SessionRow } from './scoreQueries';
import { computeStreakFromSessions, type StreakSessionRow } from './streakQueries';
import { listActivityTypesForCourses } from './activityCourseQueries';

// Aliased to `student`, same convention as lib/sessionQueries.ts's STUDENT_EMBED, because the
// table is called "user" (a reserved word). !inner matters here exactly the way it does there:
// without it, .eq('student.role', 'student') would null the embed instead of dropping the row,
// and an instructor who was somehow enrolled would still show up ranked among their own
// students. Backed by ix_user_role, the same index that embed relies on.
//
// selected_title rides along on this same embed rather than costing a query of its own: the worn
// title is stored as a title_definition_id on "user", and PostgREST resolves the name through the
// existing fk_user_title_definition foreign key. Note it is the title the student *chose*, not a
// re-derivation of their highest earned one — showing a title nobody picked would put a name on a
// leaderboard row its owner never opted into.
const ROSTER_STUDENT_EMBED =
  'student:user!inner(username, avatar_url, role, selected_title:title_definition(title_name))';

type RosterRow = {
  user_id: string;
  student: {
    username: string;
    avatar_url: string | null;
    role: string;
    selected_title: { title_name: string } | null;
  };
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
  /** The mastery title this student chose to wear, or null if they haven't picked one. */
  title: string | null;
};

type CombinedSessionRow = SessionRow & StreakSessionRow & { user_id: string; passed: boolean };

/**
 * Shared tail of both computeCourseLeaderboard and computeGlobalLeaderboard below: given a roster
 * and every completed session for it, reduce each student's points (via pointsFilter, the one
 * thing that differs between the two callers, plus extraPointsByStudent — points that don't come
 * from session_log at all, see computeGlobalLeaderboard's Daily Challenge note) and streak (always
 * the student's full, unfiltered session set — see computeCourseLeaderboard's own comment on why
 * streak never gets course-scoped), then apply the one ranking rule both leaderboards share:
 * standard competition ranking on points (ties share a rank, the next rank skips: 1, 2, 2, 4),
 * username ascending as the deterministic tiebreaker.
 */
function rankRoster(
  roster: RosterRow[],
  sessionsByStudent: Map<string, CombinedSessionRow[]>,
  pointsFilter: (sessions: CombinedSessionRow[]) => CombinedSessionRow[],
  extraPointsByStudent: Map<string, number> = new Map(),
): LeaderboardRow[] {
  const unranked = roster
    .map((row) => {
      const sessions = sessionsByStudent.get(row.user_id) ?? [];
      return {
        studentId: row.user_id,
        username: row.student.username,
        avatarUrl: row.student.avatar_url,
        title: row.student.selected_title?.title_name ?? null,
        points: sumBestScores(pointsFilter(sessions)) + (extraPointsByStudent.get(row.user_id) ?? 0),
        streak: computeStreakFromSessions(sessions.filter((session) => session.passed)),
      };
    })
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username));

  const data: LeaderboardRow[] = [];
  let previousPoints: number | null = null;
  let previousRank = 0;

  unranked.forEach((entry, index) => {
    const rank = entry.points === previousPoints ? previousRank : index + 1;
    data.push({ rank, ...entry });
    previousPoints = entry.points;
    previousRank = rank;
  });

  return data;
}

/**
 * One course's leaderboard: every enrolled student, ranked by the score they earned *in this
 * course specifically* — GitHub #432 fixed a bug where every course showed the same, global
 * total: the session_log read used to be filtered only by roster membership, with no
 * activity_type filter at all, so sumBestScores summed a student's entire history across every
 * course they're in. Points are still never stored (see CLAUDE.md's "Gamification is derived,
 * not stored") — the fix is scoping the read, not adding a course_points table. Course membership
 * for an activity_type is derived the same way everywhere else (Course -> assembled_quiz ->
 * assembled_quiz_catalog -> catalog, lib/activityCourseQueries.ts's listActivityTypesForCourses).
 *
 * streak deliberately still reduces over the student's *unfiltered* sessions, not the course-
 * scoped subset: GET /api/students/{id}/streak (lib/streakQueries.ts) defines "streak" as a
 * global, cross-course concept, and a course leaderboard row disagreeing with that route about a
 * student's own streak would be a worse inconsistency than points being unscoped was.
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
 * .in() call, rather than one session_log query per student. sumBestScores reduces the
 * course-filtered subset into points exactly the way computeStudentScore reduces a single
 * student's (global) rows, and the passed=true subset of the *unfiltered* rows is reduced by
 * computeStreakFromSessions exactly the way computeStudentStreak reduces a single student's — so
 * neither number can drift from its single-student, single-purpose counterpart.
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

  const { activities: courseActivities, error: activitiesError } = await listActivityTypesForCourses(supabase, [
    courseId,
  ]);

  if (activitiesError) return { data: null, error: activitiesError };

  const courseActivityTypes = new Set((courseActivities ?? []).map((activity) => activity.activityType));

  const { data: sessionData, error: sessionError } = await supabase
    .from('session_log')
    .select('user_id, activity_type, difficulty_level, cumulative_score, ended_at, passed')
    .in('user_id', studentIds)
    .eq('status', 'completed');

  if (sessionError) return { data: null, error: sessionError };

  const sessionsByStudent = new Map<string, CombinedSessionRow[]>();
  for (const row of (sessionData ?? []) as CombinedSessionRow[]) {
    const list = sessionsByStudent.get(row.user_id) ?? [];
    list.push(row);
    sessionsByStudent.set(row.user_id, list);
  }

  const data = rankRoster(roster, sessionsByStudent, (sessions) =>
    sessions.filter((session) => courseActivityTypes.has(session.activity_type)),
  );

  return { data, error: null };
}

/**
 * A direct read off "user" rather than a student_course-scoped embed like ROSTER_STUDENT_EMBED —
 * computeGlobalLeaderboard's roster is every student account, not one scoped to a shared course,
 * so there's no join row to embed onto. Same fields, mapped into RosterRow's shape below so it can
 * still go through the shared rankRoster tail unchanged.
 */
type GlobalUserRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  selected_title: { title_name: string } | null;
};

/**
 * The dashboard's (and the full leaderboard page's "All" scope) global leaderboard: literally
 * every student account in the app, ranked by their TOTAL score across every course they're in —
 * no activity_type filter, the same "no course_id filter" definition computeStudentScore already
 * uses for a single student's own sidebar total.
 *
 * This is a deliberate, explicit exception to the disclosure boundary every other cross-user read
 * in this app enforces (GET /api/courses/{courseId}/leaderboard, GET /api/students/{id}/
 * public-profile — both gated on isEnrolledInAnyCourse, "do the caller and the target share a
 * course"). An earlier version of this function scoped the roster to "shares a course with the
 * viewer" specifically to preserve that boundary; product direction confirmed a global leaderboard
 * should mean literally every student, visible to every other student, with no shared-course
 * requirement — so the roster query below intentionally has no relationship to the caller at all.
 * A caller that wants the shared-course-only view should read GET /api/courses/{courseId}/leaderboard
 * for a specific course instead.
 *
 * Because the roster no longer depends on the caller, this takes no viewerId — every caller sees
 * the same ranking. An empty result now only means "no student accounts exist at all", not
 * "nobody enrolled anywhere"; callers that used to treat [] as "you're not in a course yet" need
 * a different signal for that (e.g. their own enrolled-courses list) now that this always returns
 * every student, enrolled or not.
 *
 * Same roster-then-sessions shape as computeCourseLeaderboard, and the same rankRoster tail — the
 * two can't disagree about what "rank" or "tie" means, only about which points count and who's
 * ranked at all.
 *
 * Unlike computeCourseLeaderboard, this also folds in every daily_challenge_attempt.score for the
 * roster (summed flat, same reasoning as computeStudentScore in lib/scoreQueries.ts — no
 * (activity_type, difficulty_level) key to dedupe on, and a null score contributes 0) via
 * rankRoster's extraPointsByStudent param, so "All" agrees with the sidebar score pill about a
 * student's total. The course leaderboard deliberately does not: Daily Challenge isn't scoped to
 * any course, so folding it into a course-specific ranking would attribute points to a course the
 * student didn't earn them in.
 */
export async function computeGlobalLeaderboard(
  supabase: SupabaseClient,
): Promise<{ data: LeaderboardRow[] | null; error: { message: string } | null }> {
  const { data: userData, error: userError } = await supabase
    .from('user')
    .select('user_id, username, avatar_url, selected_title:title_definition(title_name)')
    .eq('role', 'student');

  if (userError) return { data: null, error: userError };

  const roster: RosterRow[] = ((userData ?? []) as unknown as GlobalUserRow[]).map((row) => ({
    user_id: row.user_id,
    student: {
      username: row.username,
      avatar_url: row.avatar_url,
      role: 'student',
      selected_title: row.selected_title,
    },
  }));

  if (roster.length === 0) return { data: [], error: null };

  const studentIds = roster.map((row) => row.user_id);

  const { data: sessionData, error: sessionError } = await supabase
    .from('session_log')
    .select('user_id, activity_type, difficulty_level, cumulative_score, ended_at, passed')
    .in('user_id', studentIds)
    .eq('status', 'completed');

  if (sessionError) return { data: null, error: sessionError };

  const sessionsByStudent = new Map<string, CombinedSessionRow[]>();
  for (const row of (sessionData ?? []) as CombinedSessionRow[]) {
    const list = sessionsByStudent.get(row.user_id) ?? [];
    list.push(row);
    sessionsByStudent.set(row.user_id, list);
  }

  const { data: dailyChallengeData, error: dailyChallengeError } = await supabase
    .from('daily_challenge_attempt')
    .select('user_id, score')
    .in('user_id', studentIds);

  if (dailyChallengeError) return { data: null, error: dailyChallengeError };

  const dailyChallengePointsByStudent = new Map<string, number>();
  for (const row of (dailyChallengeData ?? []) as { user_id: string; score: number | null }[]) {
    const current = dailyChallengePointsByStudent.get(row.user_id) ?? 0;
    dailyChallengePointsByStudent.set(row.user_id, current + (row.score ?? 0));
  }

  const data = rankRoster(roster, sessionsByStudent, (sessions) => sessions, dailyChallengePointsByStudent);

  return { data, error: null };
}
