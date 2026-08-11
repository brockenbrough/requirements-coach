import { getSupabaseClient } from '../../../../../lib/supabase';
import { shuffleArray } from '../../../../../lib/shuffleArray';
import { STORIES_PER_SESSION } from '../../../../../lib/acSessionConfig';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * GET /api/activities/write-acceptance-criteria/sessions — returns the student's current
 * session with full progress: all four stories, which have a submission, and which comes
 * next (GitHub #255/#257).
 *
 * Prefers an in-progress session; falls back to the most recently completed one so a
 * student who just finished their last story still sees their results on the same request.
 * Returns { session: null } when no session exists — not an error.
 *
 * nextStoryId / nextPosition are null when all four stories are answered or the session
 * is already marked completed.
 */
export async function GET(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data: session, error: sessionError } = await supabase
    .from('ac_session')
    .select('ac_session_id, status, started_at, completed_at, total_score')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });
  if (!session) return Response.json({ session: null }, { status: 200 });

  const sessionId = session.ac_session_id;

  const { data: sessionStories, error: storiesError } = await supabase
    .from('ac_session_story')
    .select('position, user_story_id')
    .eq('ac_session_id', sessionId)
    .order('position', { ascending: true });

  if (storiesError) return Response.json({ error: storiesError.message }, { status: 500 });

  const { data: submissions, error: submissionsError } = await supabase
    .from('submission')
    .select('user_story_id')
    .eq('ac_session_id', sessionId);

  if (submissionsError) return Response.json({ error: submissionsError.message }, { status: 500 });

  const submittedIds = new Set((submissions ?? []).map((s) => s.user_story_id));

  const stories = (sessionStories ?? []).map((row) => ({
    position: row.position,
    userStoryId: row.user_story_id,
    submitted: submittedIds.has(row.user_story_id),
  }));

  const nextStory = stories.find((s) => !s.submitted) ?? null;

  return Response.json({
    session: {
      sessionId,
      status: session.status,
      startedAt: session.started_at,
      completedAt: session.completed_at ?? null,
      totalScore: session.total_score ?? null,
      submittedCount: submittedIds.size,
      storiesPerSession: STORIES_PER_SESSION,
      stories,
      nextPosition: nextStory?.position ?? null,
      nextStoryId: nextStory?.userStoryId ?? null,
    },
  }, { status: 200 });
}

/**
 * POST /api/activities/write-acceptance-criteria/sessions — starts a new AC session or
 * resumes the one already in progress (GitHub #254/#257).
 *
 * On start: shuffles the full story pool and pins STORIES_PER_SESSION of them in
 * ac_session_story (positions 1–N) so every route in this session works from the same
 * fixed set rather than drawing randomly each time. Returns 503 when the pool is too
 * small to fill a session.
 *
 * On resume: returns the existing session and its stories unchanged, with resumed: true.
 * The 200 vs 201 distinction lets the client show "continuing where you left off" instead
 * of "session started".
 */
export async function POST(request: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

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
      .select('user_story_id')
      .eq('ac_session_id', existing.ac_session_id)
      .order('position', { ascending: true });

    if (storiesError) return Response.json({ error: storiesError.message }, { status: 500 });

    const storyIds = (sessionStories ?? []).map((r) => r.user_story_id);
    return Response.json({ sessionId: existing.ac_session_id, storyIds, resumed: true }, { status: 200 });
  }

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
    await supabase.from('ac_session').delete().eq('ac_session_id', sessionId);
    return Response.json({ error: linkError.message }, { status: 500 });
  }

  const storyIds = selected.map((s) => s.user_story_id);
  return Response.json({ sessionId, storyIds, resumed: false }, { status: 201 });
}
