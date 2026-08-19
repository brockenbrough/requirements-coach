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

  const searchParams = new URL(request.url).searchParams;
  const activityType = searchParams.get('activityType');
  // GitHub #583: only meaningful alongside activityType — same "narrowed" semantics as that
  // param — scopes the check to one specific quiz instead of any quiz on the catalog.
  const assembledQuizId = searchParams.get('assembledQuizId');

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  if (activityType !== null) {
    // GitHub #525: includeDeleted — this reports "is something currently running", not a gate on
    // starting something new, so it should stay honest about an in-progress session even if the
    // catalog it's on has since been deleted.
    const { valid: validActivityType, error: activityTypeError } = await isActivityType(supabase, activityType, { includeDeleted: true });
    if (activityTypeError) return Response.json({ error: activityTypeError.message }, { status: 500 });
    if (!validActivityType) {
      return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
    }
  }

  // The student id comes from the auth session, never from the query string — this is the
  // whole of "only returns sessions belonging to the requesting student".
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  // GitHub #124: when narrowing to one activity type, the filter goes through an inner join
  // against the activity_type table (#122/#123) instead of a plain equality check on the
  // free-text column. `activity` only exists to drive that join — stripped below so
  // SESSION_COLUMNS' shape (flat activity_type) reaches the client unchanged.
  const selectColumns = activityType !== null
    ? `${SESSION_COLUMNS}, activity:activity_type!inner ( activity_type )`
    : SESSION_COLUMNS;

  let query = supabase
    .from('session_log')
    .select(selectColumns)
    .eq('user_id', user.id)
    .eq('status', 'in-progress');

  if (activityType !== null) query = query.eq('activity.activity_type', activityType);
  if (assembledQuizId !== null) query = query.eq('assembled_quiz_id', assembledQuizId);

  const { data: rows, error } = await query.order('started_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // selectColumns is a runtime string, not a literal, so supabase-js can't statically parse it
  // and infers rows as a ParserError type — cast through unknown, same as the compiler suggests,
  // since the actual runtime shape (SESSION_COLUMNS plus a nested `activity` join) is known.
  const sessions = ((rows ?? []) as unknown as Record<string, unknown>[]).map(
    ({ activity, ...rest }) => rest,
  ) as { session_id: string }[];

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
