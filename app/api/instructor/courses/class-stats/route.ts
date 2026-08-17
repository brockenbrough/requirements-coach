import { getSupabaseClient } from '../../../../../lib/supabase';
import { requireInstructor } from '../../../../../lib/instructorAuth';
import { computeAllOwnedCoursesClassStats } from '../../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/courses/class-stats — per-course class engagement (GitHub #315) for every
 * course the calling instructor owns, in one request, so the dashboard and course-browse-list
 * grids don't have to issue one request per course card. Deliberately not nested under {id} even
 * though it's course data — this list isn't scoped to one course, and a static `class-stats`
 * segment next to the dynamic `[id]` one is a supported Next.js route shape (the same reasoning
 * app/api/instructor/assembled-quizzes/questions/route.ts's sibling-of-[quizId] nesting relies on).
 *
 * No per-course ownership check needed beyond requireInstructor: scoping is inherent, since
 * computeAllOwnedCoursesClassStats is keyed off the caller's own user_id from the start.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 200 { stats: (CourseClassStats & { courseId, courseName })[] } — [] if the instructor owns no courses
 * - 500 Supabase not configured or any query failure
 */
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  const { stats, error } = await computeAllOwnedCoursesClassStats(supabase, guard.user_id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ stats: stats ?? [] }, { status: 200 });
}
