import { getSupabaseClient } from '../../../../lib/supabase';
import { requireInstructor } from '../../../../lib/instructorAuth';
import { loadAllStudentActivity } from '../../../../lib/sessionQueries';
import { listOwnedActivityTypeSummaries, type OwnedActivityTypeSummary } from '../../../../lib/activityTypeQueries';
import type { InstructorActivityEntry } from '../../../../lib/sessionTypes';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/activities — every student's attempts on catalogs this instructor created
 * (GitHub #171), plus the full list of catalogs the instructor owns (GitHub #171 follow-up —
 * the Instructor Dashboard's stat cards need this even for a just-created catalog with zero
 * attempts yet, which never appears in `sessions` at all).
 *
 * The instructor counterpart to GET /api/students/{id}/activities: the same merged timeline of
 * in-progress, completed and abandoned sessions, but scoped to activity_type.creator_id =
 * guard.user_id instead of one student, and with studentId/studentName on every entry so the
 * dashboard can group by who.
 *
 * One activity_type round trip (listOwnedActivityTypeSummaries) answers both concerns: it backs
 * `ownedActivityTypes` directly, and its mcq-kind subset is what's passed into
 * loadAllStudentActivity (lib/sessionQueries.ts) to scope `sessions` — see that function's
 * docstring for exactly what "mcq-kind only" excludes and why.
 *
 * Unlike every other route here, the caller is deliberately allowed to read rows that are not
 * theirs — which is why requireInstructor runs before any data is touched. getSupabaseClient()
 * is the service-role client and bypasses RLS entirely, so that guard, not the database, is
 * what stops a student from pulling the class's results.
 *
 * An empty sessions list is a 200, not a 404, for the same reason as /api/sessions/completed: a
 * class that has not started anything yet — or an instructor who hasn't created a catalog yet —
 * is a normal state, not a missing resource.
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

  const { activityTypeSummaries, error: ownedError } = await listOwnedActivityTypeSummaries(supabase, guard.user_id);
  if (ownedError) return Response.json({ error: ownedError.message }, { status: 500 });

  const mcqTypes = activityTypeSummaries.filter((summary) => summary.gradingKind === 'mcq').map((summary) => summary.activityType);

  const { activities, error } = await loadAllStudentActivity(supabase, mcqTypes);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Annotated with the shared row types (GitHub #173) rather than left to inference, so this
  // route and lib/sessionClient.ts's loadInstructorActivities are checked against the same
  // declaration instead of agreeing by accident.
  const payload: { sessions: InstructorActivityEntry[]; ownedActivityTypes: OwnedActivityTypeSummary[] } = {
    sessions: activities,
    ownedActivityTypes: activityTypeSummaries,
  };

  return Response.json(payload, { status: 200 });
}
