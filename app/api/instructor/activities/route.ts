import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { loadAllStudentActivity } from '../../../../lib/sessionQueries';
import type { InstructorActivityEntry } from '../../../../lib/sessionTypes';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/activities — every student's attempts, class-wide (GitHub #171).
 *
 * The instructor counterpart to GET /api/students/{id}/activities: the same merged timeline of
 * in-progress, completed and abandoned sessions, but for the whole class instead of one
 * student, and with studentId/studentName on every entry so the dashboard can group by who.
 *
 * Unlike every other route here, the caller is deliberately allowed to read rows that are not
 * theirs — which is why requireInstructor runs before any data is touched. getSupabaseClient()
 * is the service-role client and bypasses RLS entirely, so that guard, not the database, is
 * what stops a student from pulling the class's results.
 *
 * An empty list is a 200, not a 404, for the same reason as /api/sessions/completed: a class
 * that has not started anything yet is a normal state, not a missing resource.
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

  const { activities, error } = await loadAllStudentActivity(supabase);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Annotated with the shared row type (GitHub #173) rather than left to inference, so this
  // route and lib/sessionClient.ts's loadInstructorActivities are checked against the same
  // declaration instead of agreeing by accident.
  const payload: { sessions: InstructorActivityEntry[] } = { sessions: activities };

  return Response.json(payload, { status: 200 });
}
