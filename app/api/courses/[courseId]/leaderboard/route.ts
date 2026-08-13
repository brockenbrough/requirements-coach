import { getSupabaseClient } from '../../../../../lib/supabase';
import { isEnrolledInAnyCourse } from '../../../../../lib/courseQueries';
import { computeCourseLeaderboard } from '../../../../../lib/leaderboardQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/courses/{courseId}/leaderboard — ranks every student enrolled in the course by
 * cumulative score (see computeCourseLeaderboard, lib/leaderboardQueries.ts, for the ranking
 * itself).
 *
 * Enrollment is the authorization boundary here, not role or ownership: a leaderboard discloses
 * other students' usernames, photos and scores, and being enrolled in the course is what makes
 * that acceptable to see. isEnrolledInAnyCourse (lib/courseQueries.ts) is the shared membership
 * check GET /api/students/{id}/public-profile also builds its own "do we share a course"
 * authorization on, so the definition of "enrolled" can't drift between the two routes. This is
 * one of only two genuinely new cross-user authorization rules these two features add — the only
 * other student-callable route that reads across users, GET /api/courses (listJoinableCourses),
 * is far narrower: it discloses course metadata (name, professor, headcount) but never another
 * student's identity or score.
 *
 * 404-then-403, the same ordering findOwnedCourse (lib/courseQueries.ts) uses for instructor
 * ownership checks: an unknown courseId is a 404 regardless of the caller's own enrollment, and
 * only once the course is confirmed to exist does a non-member get a 403. A course that exists
 * but has nobody enrolled, or nobody with a completed session, is a normal 200 with an empty
 * list — not a 404, since the course itself is real.
 */
export async function GET(request: Request, { params }: { params: { courseId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data: course, error: courseError } = await supabase
    .from('course')
    .select('course_id')
    .eq('course_id', params.courseId)
    .maybeSingle();

  if (courseError) return Response.json({ error: courseError.message }, { status: 500 });
  if (!course) return Response.json({ error: 'Course not found.' }, { status: 404 });

  const { enrolled, error: membershipError } = await isEnrolledInAnyCourse(supabase, user.id, [params.courseId]);

  if (membershipError) return Response.json({ error: membershipError.message }, { status: 500 });
  if (!enrolled) return Response.json({ error: 'Forbidden.' }, { status: 403 });

  const { data, error } = await computeCourseLeaderboard(supabase, params.courseId);
  if (error || !data) {
    return Response.json({ error: error?.message ?? 'Could not load leaderboard.' }, { status: 500 });
  }

  return Response.json({ entries: data }, { status: 200 });
}
