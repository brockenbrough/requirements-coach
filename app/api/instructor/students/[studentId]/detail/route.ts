import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { loadStudentDetailForInstructor } from '../../../../../../lib/studentDetailQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/students/:studentId/detail — the real data behind the Instructor
 * Dashboard's per-student detail page (app/instructor/students/[id]/page.tsx), replacing
 * lib/mockStudentAttempts.ts's fixed fabricated history.
 *
 * Scoped to only the courses this instructor teaches AND this student is enrolled in — see
 * lib/studentDetailQueries.ts's header comment for why that pairing, not a class-wide read, is
 * the boundary here. 403 with no body (not a 404) is what a real student outside that pairing
 * gets, the same no-body convention requireInstructor and lib/courseQueries.ts's findOwnedCourse
 * already use — an id that isn't a student at all gets the 404 instead, so a caller can't tell
 * "wrong student" apart from "not enrolled with you" from the response alone.
 */
export async function GET(request: Request, { params }: { params: { studentId: string } }) {
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

  const result = await loadStudentDetailForInstructor(supabase, params.studentId, guard.user_id);

  switch (result.status) {
    case 'not_found':
      return Response.json({ error: 'Student not found.' }, { status: 404 });
    case 'forbidden':
      return new Response(null, { status: 403 });
    case 'error':
      return Response.json({ error: result.error.message }, { status: 500 });
    case 'ok':
      return Response.json(result.detail, { status: 200 });
  }
}
