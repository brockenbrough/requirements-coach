import { getSupabaseClient } from '../../../../lib/supabase';
import { isActivityType } from '../../../../lib/activityTypes';
import { SESSION_COLUMNS } from '../../../../lib/sessionRules';
import { loadProgressForSessions } from '../../../../lib/sessionQueries';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/sessions/in-progress — the student's running sessions (REQ-PL-2.1, REQ-DL-3).
 *
 * Always answers with { sessions: [...] }, so the client can build its own lookup from one
 * shape instead of branching on the response.
 *
 * With ?activityType=…  narrowed to that activity, or 404. This is the check the opening page
 * makes before it decides whether to offer "resume" or "start fresh"; uq_session_log_one_active
 * means the list holds at most one entry then.
 *
 * Without the parameter, every running session across all activity types. The empty list is a
 * 200 there — "no activity is running" is a normal state for an overview, while the
 * per-activity check asks about one specific record that either exists or does not.
 *
 * Each record carries what REQ-DL-3.1 asks for: status, difficulty level, cumulative score,
 * the drawn question ids in presentation order, and the index of the last answered question.
 * The last two are derived from session_to_question and answered_question_log rather than
 * stored — see lastAnsweredPosition.
 *
 * Question prompts and options are not included: this endpoint answers "is something
 * running?", and the resume itself goes through GET /api/sessions/current, which ships the
 * questions.
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const activityType = new URL(request.url).searchParams.get('activityType');

  if (activityType !== null && !isActivityType(activityType)) {
    return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  // The student id comes from the auth session, never from the query string — this is the
  // whole of "only returns sessions belonging to the requesting student".
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  let query = supabase
    .from('session_log')
    .select(SESSION_COLUMNS)
    .eq('user_id', user.id)
    .eq('status', 'in-progress');

  if (activityType !== null) query = query.eq('activity_type', activityType);

  const { data: rows, error } = await query.order('started_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const sessions = (rows ?? []) as { session_id: string }[];

  // A session belonging to somebody else was already filtered out above, so it is
  // indistinguishable from one that does not exist.
  if (activityType !== null && sessions.length === 0) {
    return Response.json({ error: 'No in-progress session for this activity type.' }, { status: 404 });
  }

  const { progress, error: progressError } = await loadProgressForSessions(
    supabase,
    sessions.map((session) => session.session_id),
  );

  if (progressError) return Response.json({ error: progressError.message }, { status: 500 });

  const withProgress = sessions.map((session) => ({
    ...session,
    ...(progress!.get(session.session_id) ?? {
      questionCount: 0,
      answeredCount: 0,
      nextPosition: null,
      questionIds: [],
      lastQuestionIndex: null,
    }),
  }));

  return Response.json({ sessions: withProgress }, { status: 200 });
}
