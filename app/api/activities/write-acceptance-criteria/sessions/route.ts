import { getSupabaseClient } from '../../../../../lib/supabase';

const STORIES_PER_SESSION = 4;

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/activities/write-acceptance-criteria/sessions — returns the student's current
 * in-progress AC session, if one exists (GitHub #257).
 *
 * Returns { session: null } when no session is in progress — not an error, just means
 * the student has not started one yet or their last session is already completed.
 */
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data, error } = await supabase
    .from('ac_session')
    .select('ac_session_id, status, started_at, completed_at, total_score')
    .eq('user_id', user.id)
    .eq('status', 'in-progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (!data) return Response.json({ session: null }, { status: 200 });

  // Include how many stories the student has already submitted in this session.
  const { count, error: countError } = await supabase
    .from('submission')
    .select('*', { count: 'exact', head: true })
    .eq('ac_session_id', data.ac_session_id);

  if (countError) return Response.json({ error: countError.message }, { status: 500 });

  return Response.json({
    session: {
      sessionId: data.ac_session_id,
      status: data.status,
      startedAt: data.started_at,
      submittedCount: count ?? 0,
      storiesPerSession: STORIES_PER_SESSION,
    },
  }, { status: 200 });
}

/**
 * POST /api/activities/write-acceptance-criteria/sessions — starts a new AC session for
 * the authenticated student (GitHub #257).
 *
 * A student can only have one in-progress session at a time — attempting to start another
 * while one is open returns 409.
 *
 * Returns 201 with { sessionId }.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  // One in-progress session at a time.
  const { data: existing, error: existingError } = await supabase
    .from('ac_session')
    .select('ac_session_id')
    .eq('user_id', user.id)
    .eq('status', 'in-progress')
    .maybeSingle();

  if (existingError) return Response.json({ error: existingError.message }, { status: 500 });
  if (existing) {
    return Response.json({ error: 'A session is already in progress.', sessionId: existing.ac_session_id }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('ac_session')
    .insert({ user_id: user.id })
    .select('ac_session_id')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ sessionId: data.ac_session_id }, { status: 201 });
}
