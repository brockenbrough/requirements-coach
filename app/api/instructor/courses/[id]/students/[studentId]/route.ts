import { getSupabaseClient } from '../../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../../lib/instructorAuth';
import { findOwnedCourse, unenrollStudent } from '../../../../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * DELETE /api/instructor/courses/{id}/students/{studentId} — removes a student's enrollment
 * link only. Never touches answered_question_log/session_log — a removed student's historical
 * attempts/scores stay exactly as they were, since student_course has no FK anything else
 * depends on (fk_student_course_course cascades the other direction, course -> its enrollments,
 * not student -> their attempts).
 *
 * Idempotent: unenrollStudent succeeds whether or not the link existed (deleting nothing is not
 * an error) — the end state ("not enrolled") is the same either way, so a stale double-click of
 * the remove button never surfaces an error.
 *
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 404 course doesn't exist
 * - 403 course exists but isn't owned by the caller (no body)
 * - 200 { studentId }
 * - 500 Supabase not configured, or the delete fails
 */
export async function DELETE(request: Request, { params }: { params: { id: string; studentId: string } }) {
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

  const { error } = await unenrollStudent(supabase, { courseId: params.id, studentId: params.studentId });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ studentId: params.studentId }, { status: 200 });
}
