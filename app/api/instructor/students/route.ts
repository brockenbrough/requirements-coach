import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { resolveInstructorStudentIds } from '../../../../lib/courseScope';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

type StudentRow = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
};

/**
 * GET /api/instructor/students[?scope=all] — students enrolled in a course this instructor
 * created (GitHub #145 follow-up).
 *
 * Default (no ?scope, or anything other than "all"): scoped to resolveInstructorStudentIds
 * (lib/courseScope.ts) — every distinct student enrolled in any course this instructor owns
 * (course.creator_id). An instructor who owns no courses, or whose courses have no enrollees,
 * gets a 200 with an empty list rather than the previous "every student in the system" — a class
 * with nothing enrolled yet is a normal state, not a missing resource.
 *
 * ?scope=all opts back into the original unscoped query. There is exactly one legitimate caller
 * of this: components/AddStudentModal.tsx's enrollment search, which must be able to find a
 * student who isn't in any of the instructor's courses yet — otherwise nobody could ever be
 * enrolled for the first time. Every other caller (the Students page, the dashboard's student
 * filter and participation denominator) wants the scoped default.
 *
 * getSupabaseClient() is the service-role client and bypasses RLS entirely, which is why
 * requireInstructor must run before any data is read. That guard, not the database, is what
 * stops a student from pulling the roster, scoped or not.
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

  const scopeAll = new URL(request.url).searchParams.get('scope') === 'all';

  // Resolved before touching the "user" table at all, so an instructor who owns no (or empty)
  // courses short-circuits without a wasted query — building the "user" query first and only
  // conditionally adding .in(...) would still call supabase.from('user') on that early-return path.
  let studentIds: string[] | null = null;
  if (!scopeAll) {
    const resolved = await resolveInstructorStudentIds(supabase, guard.user_id);
    if (resolved.error) return Response.json({ error: resolved.error.message }, { status: 500 });
    if (resolved.studentIds.length === 0) return Response.json({ students: [] }, { status: 200 });
    studentIds = resolved.studentIds;
  }

  let query = supabase.from('user').select('user_id, username, first_name, last_name').eq('role', 'student');
  if (studentIds) query = query.in('user_id', studentIds);

  const { data, error } = await query;

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const students = ((data ?? []) as StudentRow[]).map((row) => ({
    userId: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
  }));

  return Response.json({ students }, { status: 200 });
}
