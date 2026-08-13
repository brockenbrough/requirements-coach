import { getSupabaseClient } from '../../../../../lib/supabase';
import { isEnrolledInAnyCourse, unenrollStudent } from '../../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * DELETE /api/courses/{courseId}/enrollment — a student leaves a course on their own initiative
 * (GitHub #325), the self-service counterpart to
 * DELETE /api/instructor/courses/{id}/students/{studentId}. studentId always comes from the
 * bearer token, never the path or body — a student can only ever remove their own enrollment.
 * Reuses unenrollStudent (lib/courseQueries.ts) unchanged: that helper already only cares about
 * (courseId, studentId), not who is calling it.
 *
 * Unlike the instructor-driven route, this one is NOT idempotent on "never enrolled": deleting an
 * enrollment that doesn't exist for the caller 404s rather than silently succeeding. That route's
 * idempotency is about tolerating a stale double-click on a remove button an instructor might
 * click twice; here, "isn't enrolled" instead means the resource this path names — this caller's
 * membership in this course — never existed, which membership check the leaderboard route
 * (GET /api/courses/{courseId}/leaderboard) already runs via the same isEnrolledInAnyCourse
 * helper, kept identical here so "enrolled" can't drift between the two routes.
 *
 * - 401 missing/invalid bearer token
 * - 404 unknown course
 * - 404 course exists but the caller isn't enrolled in it
 * - 200 { courseId }
 * - 500 Supabase not configured, course lookup, membership check, or delete failure
 */
export async function DELETE(request: Request, { params }: { params: { courseId: string } }) {
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
  if (!enrolled) return Response.json({ error: 'You are not enrolled in this course.' }, { status: 404 });

  const { error } = await unenrollStudent(supabase, { courseId: params.courseId, studentId: user.id });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ courseId: params.courseId }, { status: 200 });
}
