import { getSupabaseClient } from '../../../../../lib/supabase';
import { shuffleArray } from '../../../../../lib/shuffleArray';

const STORIES_PER_SESSION = 4;

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/activities/write-acceptance-criteria/sessions — starts a new AC session or
 * resumes the one already in progress (GitHub #254).
 *
 * On start: selects STORIES_PER_SESSION random user stories and records them in
 * ac_session_story (positions 1–4) so every subsequent request in this session works from
 * the same fixed set. Returns 503 when the story pool is too small to fill a session.
 *
 * On resume: returns the existing in-progress session unchanged with resumed: true. A 200
 * here is not an error — the client uses resumed to decide whether to show a "continuing
 * where you left off" message rather than a "session started" one.
 *
 * Returns 201 { sessionId, storyIds, resumed: false } on start.
 * Returns 200 { sessionId, storyIds, resumed: true } on resume.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  // Resume path: return the existing in-progress session with its stories.
  const { data: existing, error: existingError } = await supabase
    .from('ac_session')
    .select('ac_session_id')
    .eq('user_id', user.id)
    .eq('status', 'in-progress')
    .maybeSingle();

  if (existingError) return Response.json({ error: existingError.message }, { status: 500 });

  if (existing) {
    const { data: sessionStories, error: storiesError } = await supabase
      .from('ac_session_story')
      .select('user_story_id, position')
      .eq('ac_session_id', existing.ac_session_id)
      .order('position', { ascending: true });

    if (storiesError) return Response.json({ error: storiesError.message }, { status: 500 });

    const storyIds = (sessionStories ?? []).map((r) => r.user_story_id);
    return Response.json({ sessionId: existing.ac_session_id, storyIds, resumed: true }, { status: 200 });
  }

  // Start path: need at least STORIES_PER_SESSION stories in the pool.
  const { data: allStories, error: storiesError } = await supabase
    .from('user_story')
    .select('user_story_id');

  if (storiesError) return Response.json({ error: storiesError.message }, { status: 500 });

  if (!allStories || allStories.length < STORIES_PER_SESSION) {
    return Response.json(
      { error: `This activity needs at least ${STORIES_PER_SESSION} user stories, but only ${allStories?.length ?? 0} are available. Please check back later.` },
      { status: 503 },
    );
  }

  const selected = shuffleArray(allStories).slice(0, STORIES_PER_SESSION);

  const { data: session, error: sessionError } = await supabase
    .from('ac_session')
    .insert({ user_id: user.id })
    .select('ac_session_id')
    .single();

  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });

  const sessionId = session.ac_session_id;

  const storyRows = selected.map((s, i) => ({
    ac_session_id: sessionId,
    user_story_id: s.user_story_id,
    position: i + 1,
  }));

  const { error: linkError } = await supabase.from('ac_session_story').insert(storyRows);

  if (linkError) {
    // Clean up the orphaned session so the student can try again.
    await supabase.from('ac_session').delete().eq('ac_session_id', sessionId);
    return Response.json({ error: linkError.message }, { status: 500 });
  }

  const storyIds = selected.map((s) => s.user_story_id);
  return Response.json({ sessionId, storyIds, resumed: false }, { status: 201 });
}
