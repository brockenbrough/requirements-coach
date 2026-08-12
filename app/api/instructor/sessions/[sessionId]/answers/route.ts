import { getSupabaseClient } from '../../../../../../lib/supabase';
import { requireInstructor } from '../../../../../../lib/instructorAuth';
import { loadInstructorSessionQuestions } from '../../../../../../lib/sessionQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/instructor/sessions/:sessionId/answers — one quiz session's questions, every
 * option's correctness, and which option the student picked (GitHub #276).
 *
 * The detail behind the combined Instructor Dashboard's expandable quiz-attempt row: GET
 * /api/instructor/activities only ever answers "who did what and how did it go" (see its own
 * comment) at the session-summary level, so this is the per-question drill-down a click on that
 * row fetches on demand rather than up front for every session in the list.
 *
 * Gated by requireInstructor like every other class-wide read — getSupabaseClient() bypasses
 * RLS, so that guard is what stops a student from reading another student's answer detail.
 */
export async function GET(request: Request, { params }: { params: { sessionId: string } }) {
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

  const { data: session, error: sessionError } = await supabase
    .from('session_log')
    .select('session_id')
    .eq('session_id', params.sessionId)
    .maybeSingle();

  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });
  if (!session) return Response.json({ error: 'Session not found.' }, { status: 404 });

  const { questions, error } = await loadInstructorSessionQuestions(supabase, params.sessionId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ questions }, { status: 200 });
}
