import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { findOwnedCourse, getCourseEngagement } from '../../../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/courses/{id}/engagement — enrolled count, active students, average score,
 * and pass rate for a course the calling instructor owns (GitHub #335).
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 404 course not found
 * - 403 course exists but caller doesn't own it (no body)
 * - 200 { courseId, courseName, enrolledCount, activeStudentCount, averageScore, passRate }
 * - 500 Supabase not configured or any query failure
 *
 * averageScore and passRate are null when no enrolled student has a completed session yet.
 * averageScore is a fraction 0–1 (e.g. 0.72 = 72%), not a raw point total.
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

  const { engagement, error } = await getCourseEngagement(supabase, params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(
    {
      courseId: found.course.course_id,
      courseName: found.course.course_name,
      enrolledCount: engagement!.enrolledCount,
      activeStudentCount: engagement!.activeStudentCount,
      averageScore: engagement!.averageScore,
      passRate: engagement!.passRate,
    },
    { status: 200 },
  );
}
