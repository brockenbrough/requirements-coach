import { getSupabaseClient } from '../../../../../lib/supabase';
import { getEnrolledCourseIds, isEnrolledInAnyCourse } from '../../../../../lib/courseQueries';
import { computeStudentScore } from '../../../../../lib/scoreQueries';
import { computeStudentTitles, loadAvailableTitleLadders } from '../../../../../lib/titleQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/students/{studentId}/public-profile — a classmate's profile, as
 * app/students/[id]/page.tsx renders it (reached from a leaderboard/dashboard-preview username).
 *
 * Deliberately does NOT reuse the /api/students/{studentId}/* preamble every other route under
 * this path shares (score, titles, activities, history): those all 403 the instant studentId
 * isn't the caller's own id, by design — this route exists precisely to serve someone ELSE's
 * data, under a different authorization rule (see below), so copying that preamble would defeat
 * the route's entire purpose.
 *
 * PRIVACY CONTRACT — returns exactly { username, avatarUrl, biography, score, titles,
 * availableTitles } and nothing else. No first_name/last_name/age/semester (on "user" but never
 * selected here) and no role (selected, but only to decide the 403 below — never put in the
 * response body). score and titles are computeStudentScore/computeStudentTitles's own numbers
 * (lib/scoreQueries.ts, lib/titleQueries.ts), not re-derived here, so this can never disagree
 * with the sidebar score pill or GET /api/students/{id}/titles about what either means.
 * availableTitles (the full earnable ladder for each of the target's enrolled-course activities,
 * loadAvailableTitleLadders) reuses targetCourseIds already fetched below for the shared-course
 * check, rather than querying student_course a second time — this route is the only place a peer
 * can see another student's ladder, since GET /api/students/{id}/available-titles is self-only.
 *
 * Authorization is "do the caller and the target share a course", not role or ownership: a
 * profile discloses another student's score and titles, and being classmates somewhere is what
 * makes that acceptable to see. Built on isEnrolledInAnyCourse (lib/courseQueries.ts), the same
 * shared helper GET /api/courses/{courseId}/leaderboard's own enrollment check uses (there with
 * a single-course list; here with the target's full course list) — one definition of "enrolled"
 * for both routes.
 *
 * 404-then-403, same ordering as the leaderboard route: an unknown studentId is a 404 regardless
 * of anything else. Once the target is confirmed to exist, a non-student target (an instructor
 * has no public profile) is a 403, and only then does the course-overlap check run.
 */
export async function GET(request: Request, { params }: { params: { studentId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data: target, error: targetError } = await supabase
    .from('user')
    .select('username, avatar_url, biography, role')
    .eq('user_id', params.studentId)
    .maybeSingle();

  if (targetError) return Response.json({ error: targetError.message }, { status: 500 });
  if (!target) return Response.json({ error: 'Student not found.' }, { status: 404 });
  if ((target as { role: string }).role !== 'student') {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { courseIds: targetCourseIds, error: targetCoursesError } = await getEnrolledCourseIds(
    supabase,
    params.studentId,
  );
  if (targetCoursesError || !targetCourseIds) {
    return Response.json({ error: targetCoursesError?.message ?? 'Could not load courses.' }, { status: 500 });
  }

  const { enrolled, error: sharedCourseError } = await isEnrolledInAnyCourse(supabase, user.id, targetCourseIds);
  if (sharedCourseError) return Response.json({ error: sharedCourseError.message }, { status: 500 });
  if (!enrolled) return Response.json({ error: 'Forbidden.' }, { status: 403 });

  const [
    { score, error: scoreError },
    { titles, error: titlesError },
    { activities: availableTitles, error: availableTitlesError },
  ] = await Promise.all([
    computeStudentScore(supabase, params.studentId),
    computeStudentTitles(supabase, params.studentId),
    loadAvailableTitleLadders(supabase, targetCourseIds),
  ]);

  const computeError = scoreError ?? titlesError ?? availableTitlesError;
  if (computeError || score === null || !titles || !availableTitles) {
    return Response.json({ error: computeError?.message ?? 'Could not load profile.' }, { status: 500 });
  }

  const profile = target as { username: string; avatar_url: string | null; biography: string };

  return Response.json(
    {
      username: profile.username,
      avatarUrl: profile.avatar_url,
      biography: profile.biography,
      score,
      titles,
      availableTitles,
    },
    { status: 200 },
  );
}
