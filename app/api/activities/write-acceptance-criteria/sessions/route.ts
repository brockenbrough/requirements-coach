import { getSupabaseClient } from '../../../../../lib/supabase';
import { SESSION_COLUMNS, START_DIFFICULTY_LEVEL } from '../../../../../lib/sessionRules';
import { SESSION_MAX_SCORE, STORIES_PER_SESSION } from '../../../../../lib/llmActivityRules';
import { findInProgressAcSession, loadSessionStories } from '../../../../../lib/llmActivityQueries';
import { shuffleArray } from '../../../../../lib/shuffleArray';
import type { SupabaseClient } from '../../../../../lib/sessionQueries';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/activities/write-acceptance-criteria/sessions — starts the activity, or returns the
 * session already in progress. Mirrors POST /api/sessions almost exactly: same
 * uq_session_log_one_active idempotency (start and resume are the same call), same session_log
 * row shape, just drawing from user_story/session_to_user_story instead of
 * question/session_to_question. This is what makes abandon, resume and "previous attempts" work
 * for this activity the same way they already do for Type A.
 */
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const existing = await findInProgressAcSession(supabase, user.id);
  if (existing.error) return Response.json({ error: existing.error.message }, { status: 500 });
  if (existing.session) return respondWithSession(supabase, existing.session, { created: false });

  const { data: pool, error: poolError } = await supabase
    .from('user_story')
    .select('user_story_id')
    .eq('activity_type', 'WRITE_ACCEPTANCE_CRITERIA');

  if (poolError) return Response.json({ error: poolError.message }, { status: 500 });

  if (!pool || pool.length < STORIES_PER_SESSION) {
    return Response.json(
      { error: `At least ${STORIES_PER_SESSION} user stories are required for this activity.` },
      { status: 400 },
    );
  }

  const picked = shuffleArray(pool as { user_story_id: string }[]).slice(0, STORIES_PER_SESSION);

  const sessionId = crypto.randomUUID();

  const { data: session, error: insertError } = await supabase
    .from('session_log')
    .insert({
      session_id: sessionId,
      user_id: user.id,
      activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
      difficulty_level: START_DIFFICULTY_LEVEL,
      status: 'in-progress',
      cumulative_score: 0,
      max_score: SESSION_MAX_SCORE,
      passed: false,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (insertError || !session) {
    // A parallel request won uq_session_log_one_active — return that session instead of failing.
    if (insertError?.code === UNIQUE_VIOLATION) {
      const raced = await findInProgressAcSession(supabase, user.id);
      if (raced.session) return respondWithSession(supabase, raced.session, { created: false });
    }
    // session_log.user_id references "user"(user_id): authenticated but no profile row yet.
    if (insertError?.code === FOREIGN_KEY_VIOLATION && insertError.message.includes('fk_session_log_user')) {
      return Response.json({ error: 'Create a profile before starting an activity.' }, { status: 409 });
    }
    return Response.json({ error: insertError?.message ?? 'Could not create session.' }, { status: 500 });
  }

  const { error: linkError } = await supabase
    .from('session_to_user_story')
    .insert(picked.map((story, index) => ({
      session_id: sessionId,
      user_story_id: story.user_story_id,
      position: index,
    })));

  if (linkError) {
    // Without its stories the session is unusable, and it would block every future start
    // because of uq_session_log_one_active. Remove it rather than leave it stranded.
    await supabase.from('session_log').delete().eq('session_id', sessionId);
    return Response.json({ error: linkError.message }, { status: 500 });
  }

  return respondWithSession(supabase, session, { created: true });
}

async function respondWithSession(supabase: SupabaseClient, session: unknown, { created }: { created: boolean }) {
  const sessionId = (session as { session_id: string }).session_id;
  const { stories, error } = await loadSessionStories(supabase, sessionId);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(
    { session, stories, resumed: !created },
    { status: created ? 201 : 200 },
  );
}
