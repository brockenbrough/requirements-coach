import { getSupabaseClient } from '../../../lib/supabase';
import { getEnrolledCourseIds } from '../../../lib/courseQueries';
import { listActivityTypesForCourses } from '../../../lib/activityCourseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/activities — "what activities can I see": built-in or instructor-created, a catalog
 * only shows up here if it's reachable through an assembled_quiz belonging to a course the caller
 * is enrolled in (getEnrolledCourseIds + listActivityTypesForCourses, the same enrolled-course-ids
 * building block GET /api/daily-challenge's own pool draw uses) — a catalog has no course of its
 * own.
 *
 * Unlike GET /api/instructor/quizzes (every catalog in the system, unfiltered — quizzes are
 * globally *browsable* by any instructor), this route is scoped per caller: two students in
 * different courses see different lists, and an enrolled-in-nothing student sees an empty one —
 * 200 [], not an error, the same "nothing to show yet" shape as every other student-facing list
 * in this app.
 *
 * An optional `?courseId=` (GitHub #427) narrows the result to just that one course's activities
 * — the student course-detail page's "quizzes in this course" list, reusing this same query
 * rather than a second, parallel one. The caller must already be enrolled in that course: a
 * courseId that isn't in the caller's own getEnrolledCourseIds result 403s (no body, matching
 * every other ownership/enrollment guard in this app) rather than silently returning an empty
 * list — a course that exists but the caller isn't in, and one that doesn't exist at all,
 * collapse to the same outcome, the same reasoning checkActivityAccess documents for its own
 * 'forbidden' status.
 *
 * GitHub #583: dedupeByQuiz: true, so two assembled quizzes composed from the same catalog for
 * the same course both appear here as distinct entries (each carrying its own assembledQuizId)
 * rather than collapsing to one — previously a student enrolled in a course with two such quizzes
 * only ever saw one of them.
 *
 * - 401 missing/invalid bearer token
 * - 403 courseId given but the caller isn't enrolled in it (no body)
 * - 200 { activities: [{ activityType, name, description, courseId, courseName, assembledQuizId }] }
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

  const requestedCourseId = new URL(request.url).searchParams.get('courseId');
  let scopedCourseIds = courseIds;
  if (requestedCourseId !== null) {
    if (!courseIds.includes(requestedCourseId)) return new Response(null, { status: 403 });
    scopedCourseIds = [requestedCourseId];
  }

  // GitHub #583: dedupeByQuiz so two quizzes composed from the same catalog both surface here as
  // distinct entries instead of collapsing to one — the direct fix for "only one of two quizzes
  // shows to students". Other callers of listActivityTypesForCourses (loadAvailableTitleLadders,
  // computeCourseLeaderboard) do not opt in, since titles stay catalog-scoped by design.
  const { activities, error } = await listActivityTypesForCourses(supabase, scopedCourseIds, { dedupeByQuiz: true });
  if (error || !activities) {
    return Response.json({ error: error?.message ?? 'Could not load activities.' }, { status: 500 });
  }

  return Response.json({ activities }, { status: 200 });
}
