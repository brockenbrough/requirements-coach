import { getSupabaseClient } from '../../../../lib/supabase';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

const HISTORY_COLUMNS = 'activity_type, difficulty_level, cumulative_score, max_score, passed, ended_at';

/**
 * GET /api/sessions/history — the student's full activity history (REQ-PL-3.1).
 *
 * Returns all completed sessions for the requesting student across all activity
 * types, ordered by completion date descending so the most recent attempt is
 * first. The student id comes from the auth token — a student can only ever
 * see their own history.
 *
 * An empty array is a valid response: a student who has not yet completed any
 * activity has a legitimate empty history.
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data, error } = await supabase
    .from('session_log')
    .select(HISTORY_COLUMNS)
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('ended_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ sessions: data ?? [] }, { status: 200 });
}
