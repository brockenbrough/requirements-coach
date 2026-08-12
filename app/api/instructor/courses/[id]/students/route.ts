import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { enrollStudentInCourse, findOwnedCourse } from '../../../../../../lib/courseQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/instructor/courses/{id}/students — enrolls a student in a course the calling
 * instructor owns.
 *
 * Body: { studentId }.
 * - 401 missing/invalid bearer token
 * - 403 caller isn't an instructor (no body)
 * - 404 course doesn't exist
 * - 403 course exists but isn't owned by the caller (no body)
 * - 400 missing/blank studentId
 * - 404 studentId doesn't match a real student — same lookup precedent as
 *   app/api/instructor/students/[studentId]/history/route.ts
 * - 409 the student is already enrolled (uq_student_course_user_course)
 * - 201 { student: { id, name, attempts: 0, averageScore: null, abandonedCount: 0, needsAttention: false } }
 * - 500 Supabase not configured, or any query failure
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { studentId } = (body ?? {}) as { studentId?: unknown };
  if (typeof studentId !== 'string' || studentId.trim() === '') {
    return Response.json({ error: 'studentId is required.' }, { status: 400 });
  }

  const { data: student, error: studentError } = await supabase
    .from('user')
    .select('user_id, first_name, last_name, username')
    .eq('user_id', studentId)
    .eq('role', 'student')
    .maybeSingle();

  if (studentError) return Response.json({ error: studentError.message }, { status: 500 });
  if (!student) return Response.json({ error: 'Student not found.' }, { status: 404 });

  const { alreadyMember, error: enrollError } = await enrollStudentInCourse(supabase, {
    userId: studentId,
    courseId: params.id,
  });

  if (enrollError) return Response.json({ error: enrollError.message }, { status: 500 });
  if (alreadyMember) {
    return Response.json({ error: 'This student is already enrolled in this course.' }, { status: 409 });
  }

  const row = student as { first_name: string | null; last_name: string | null; username: string | null };
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.username || 'Unknown student';

  return Response.json(
    { student: { id: studentId, name, attempts: 0, averageScore: null, abandonedCount: 0, needsAttention: false } },
    { status: 201 },
  );
}
