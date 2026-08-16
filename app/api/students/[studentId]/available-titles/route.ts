import { getSupabaseClient } from '../../../../../lib/supabase';
import { getEnrolledCourseIds } from '../../../../../lib/courseQueries';
import { loadAvailableTitleLadders } from '../../../../../lib/titleQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/students/{studentId}/available-titles — every title the caller could ever earn: one
 * entry per activity type linked to a course they're enrolled in, each with its full
 * title_definition ladder (all difficulty levels), not just the level they've reached.
 *
 * This is the real replacement for the compile-time-fixed ladder that used to live on
 * ActivityDefinition.titles (lib/activityContent.ts) and get reconciled client-side in
 * lib/masteryTitles.ts — that ladder only ever covered the three built-in activity types and had
 * drifted from title_definition's actual title_name values. This route is course-scoped the same
 * way GET /api/activities is, so an instructor-created custom quiz linked to an enrolled course
 * shows up here too, not just the three built-ins.
 *
 * studentId must match the authenticated user, the same self-only rule GET /api/students/{id}/
 * titles and /score already enforce on this path — there is no instructor exception.
 *
 * - 401 missing/invalid bearer token
 * - 403 studentId is not the caller's own id
 * - 200 { activities: [{ activityType, activityName, courseId, courseName, titles: [{ difficultyLevel, title }] }] }
 *   (enrolled in nothing → 200 [], the same "nothing to show yet" shape GET /api/activities uses)
 * - 500 Supabase not configured, or either underlying query fails
 */
export async function GET(request: Request, { params }: { params: { studentId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  if (params.studentId !== user.id) {
    return Response.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { courseIds, error: courseIdsError } = await getEnrolledCourseIds(supabase, user.id);
  if (courseIdsError || !courseIds) {
    return Response.json({ error: courseIdsError?.message ?? 'Could not load your courses.' }, { status: 500 });
  }

  const { activities, error } = await loadAvailableTitleLadders(supabase, courseIds);
  if (error || !activities) {
    return Response.json({ error: error?.message ?? 'Could not load available titles.' }, { status: 500 });
  }

  return Response.json({ activities }, { status: 200 });
}
