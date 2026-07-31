import { getSupabaseClient } from '../../../../../lib/supabase';
import { SESSION_COLUMNS } from '../../../../../lib/sessionRules';

type SessionRow = { session_id: string; status: string };

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/sessions/{sessionId}/abandon — gives up a running activity (REQ-PL-2.1, REQ-DL-3.1).
 *
 * The only way out of 'in-progress' other than answering every question. Without it a student
 * who wants to start over is stuck: uq_session_log_one_active allows one running session per
 * activity type, so POST /api/sessions keeps handing back the same one.
 *
 * A dedicated endpoint rather than a general status update: status, passed and cumulative_score
 * are decided by the server everywhere else in this API, and 'abandoned' is the one transition a
 * student is allowed to trigger. A PATCH taking a status would put 'completed' within reach of
 * the client.
 *
 * The answers already given are kept. They no longer count for anything — computeStudentScore
 * only sums passed sessions — but the attempt stays visible in the history
 * (GET /api/sessions?status=abandoned).
 */
export async function POST(request: Request, { params }: { params: { sessionId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  // The student id comes from the auth session, never from the path.
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { sessionId } = params;

  // Scoping the lookup by user_id is what keeps one student from abandoning another's session:
  // a foreign session id is indistinguishable from a non-existent one.
  const { data: session, error: sessionError } = await supabase
    .from('session_log')
    .select(SESSION_COLUMNS)
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });
  if (!session) return Response.json({ error: 'Session not found.' }, { status: 404 });

  // The status is a one-way street: a finished session cannot be turned into an abandoned one
  // afterwards, or a bad result could be talked away once it is on the record.
  if ((session as SessionRow).status !== 'in-progress') {
    return Response.json(
      { error: `Session is ${(session as SessionRow).status}.`, session },
      { status: 409 },
    );
  }

  // ended_at is set for the same reason as in completeSession: the session is over, just not
  // successfully. passed and cumulative_score are left alone — passed is already false, and the
  // score earned so far stays as history.
  //
  // The status guard repeats the check above inside the write, so a last answer landing between
  // the two cannot be overwritten by this update.
  const { data: abandoned, error: updateError } = await supabase
    .from('session_log')
    .update({ status: 'abandoned', ended_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('status', 'in-progress')
    .select(SESSION_COLUMNS)
    .maybeSingle();

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  // No row came back: the session left 'in-progress' in the meantime, so nothing was abandoned.
  // Report what it actually is instead of claiming a write that did not happen.
  if (!abandoned) {
    const { data: current } = await supabase
      .from('session_log')
      .select(SESSION_COLUMNS)
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();

    return Response.json(
      { error: `Session is ${(current as SessionRow | null)?.status ?? 'no longer in progress'}.`, session: current },
      { status: 409 },
    );
  }

  return Response.json({ session: abandoned }, { status: 200 });
}
