import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { loadAllStudentSessions } from '../../../../lib/sessionQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/sessions — every session_log record belonging to a student, for an
 * instructor (GitHub #115).
 *
 * Deliberately a separate route from GET /api/instructor/activities (#171), not a variant of
 * it: that route answers 200 with an empty list for a class that has not started anything, by
 * design (see its docstring) — #115's AC explicitly asks for 404 in that same case, and
 * changing #171's behavior to match would break the instructor dashboard that already depends
 * on it.
 *
 * "Students of the current prof" is, today, every account with role 'student' — the same scope
 * #171 already uses. There is no professor-to-student assignment (class/section) anywhere in
 * the schema, so a real per-professor scope is not something this route can add on its own;
 * every instructor account currently sees every student, same as #171.
 */
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const guard = await requireInstructor(supabase, getToken(request));
  if (!guard.ok) {
    // 403 answers with no body at all (GitHub #169's acceptance criteria); 401 and 500 keep
    // the { error } shape every other route uses.
    return guard.status === 403
      ? new Response(null, { status: 403 })
      : Response.json(
          { error: guard.status === 401 ? 'Unauthorized' : 'Supabase credentials are not configured.' },
          { status: guard.status },
        );
  }

  const { sessions, error } = await loadAllStudentSessions(supabase);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // AC: 404 when no session_log records exist — unlike #171, which treats this as a normal,
  // empty class overview.
  if (!sessions || sessions.length === 0) {
    return Response.json({ error: 'No sessions found.' }, { status: 404 });
  }

  return Response.json({ sessions }, { status: 200 });
}
