import { getSupabaseClient } from '../../../lib/supabase';
import { getEnrolledCourseIds } from '../../../lib/courseQueries';
import { listActivityTypesForCourses } from '../../../lib/activityCourseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/activities — "what activities can I see", the student-facing discovery route every
 * activity_type now needs (activity_type_course): built-in or instructor-created, an activity
 * only shows up here if it's linked to a course the caller is enrolled in
 * (getEnrolledCourseIds + listActivityTypesForCourses, the same enrolled-course-ids building
 * block GET /api/daily-challenge's own pool draw uses).
 *
 * Unlike GET /api/instructor/quizzes (every catalog in the system, unfiltered — quizzes are
 * globally *browsable* by any instructor), this route is scoped per caller: two students in
 * different courses see different lists, and an enrolled-in-nothing student sees an empty one —
 * 200 [], not an error, the same "nothing to show yet" shape as every other student-facing list
 * in this app.
 *
 * - 401 missing/invalid bearer token
 * - 200 { activities: [{ activityType, name, description, courseId, courseName }] }
 * - 500 Supabase not configured, or either query fails
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { courseIds, error: courseIdsError } = await getEnrolledCourseIds(supabase, user.id);
  if (courseIdsError || !courseIds) {
    return Response.json({ error: courseIdsError?.message ?? 'Could not load your courses.' }, { status: 500 });
  }

  const { activities, error } = await listActivityTypesForCourses(supabase, courseIds);
  if (error || !activities) {
    return Response.json({ error: error?.message ?? 'Could not load activities.' }, { status: 500 });
  }

  return Response.json({ activities }, { status: 200 });
}
