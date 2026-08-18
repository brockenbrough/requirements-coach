import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { findOwnedCourse, computeCourseClassStats } from '../../../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/courses/{id}/engagement — per-course class engagement for a course the
 * calling instructor owns (GitHub #315): total enrolled, and the count+percent of enrolled
 * students who've started/passed at least one of this course's quizzes. Strictly scoped to this
 * course's roster and to the activity_types its assembled_quiz rows compose — see
 * computeCourseClassStats's own docblock (lib/courseQueries.ts) for the exact scoping and the
 * started/passed/percent rules.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 404 course not found
 * - 403 course exists but caller doesn't own it (no body)
 * - 200 { courseId, courseName, totalStudents, hasQuizzes, startedCount, startedPercent, passedCount, passedPercent }
 * - 500 Supabase not configured or any query failure
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
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

  const found = await findOwnedCourse(supabase, params.id, guard.user_id);
  if (found.status === 'error') return Response.json({ error: found.error.message }, { status: 500 });
  if (found.status === 'not_found') return Response.json({ error: 'Course not found.' }, { status: 404 });
  if (found.status === 'forbidden') return new Response(null, { status: 403 });

  const { stats, error } = await computeCourseClassStats(supabase, params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(
    {
      courseId: found.course.course_id,
      courseName: found.course.course_name,
      ...stats!,
    },
    { status: 200 },
  );
}
