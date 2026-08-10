import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';

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
 * GET /api/instructor/students — every student in the system (GitHub #145).
 *
 * Not scoped per-professor: the course has one instructor seat and one shared roster, so
 * filtering by who is asking would return the same list every time and just add a join.
 * This is a documented simplification captured in the issue.
 *
 * An empty list is a 200, not a 404 — a class with no students yet is a normal state.
 *
 * getSupabaseClient() is the service-role client and bypasses RLS entirely, which is why
 * requireInstructor must run before any data is read. That guard, not the database, is what
 * stops a student from pulling the full roster.
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

  const { data, error } = await supabase
    .from('user')
    .select('user_id, username, first_name, last_name')
    .eq('role', 'student');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const students = ((data ?? []) as StudentRow[]).map((row) => ({
    userId: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
  }));

  return Response.json({ students }, { status: 200 });
}
