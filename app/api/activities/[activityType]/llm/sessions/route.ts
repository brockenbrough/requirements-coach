import { getSupabaseClient } from '../../../../../../lib/supabase';
import { SESSION_COLUMNS } from '../../../../../../lib/sessionRules';
import { STORIES_PER_SESSION, sessionMaxScoreForDifficulty } from '../../../../../../lib/llmActivityRules';
import { loadSessionStories, loadUserStoryPool } from '../../../../../../lib/llmActivityQueries';
import { findInProgressSession, findStartDifficultyLevel } from '../../../../../../lib/sessionQueries';
import { getAccessibleCourseForActivity } from '../../../../../../lib/activityCourseQueries';
import { listQuizExcludedUserStoryIds } from '../../../../../../lib/assembledQuizQueries';
import { getGradingKind } from '../../../../../../lib/activityTypes';
import { shuffleArray } from '../../../../../../lib/shuffleArray';
import type { SupabaseClient } from '../../../../../../lib/sessionQueries';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

/**
 * POST /api/activities/:activityType/llm/sessions — starts an LLM-graded activity, or returns the
 * session already in progress (GitHub #379). The generic replacement for the hardcoded
 * write-acceptance-criteria route: WRITE_ACCEPTANCE_CRITERIA is now just one activityType this
 * serves, not a special case with its own file.
 *
 * Mirrors POST /api/sessions almost exactly — same uq_session_log_one_active idempotency (start
 * and resume are the same call), same session_log row shape, same replay-level ceiling — drawing
 * from user_story/session_to_user_story instead of question/session_to_question. That is what
 * makes abandon, resume and "previous attempts" work here through the very same routes.
 *
 * Body: { difficultyLevel?: number } — an optional replay of an already-passed level.
 *
 * Three things this does that the route it replaces did not:
 *
 * - It refuses an MCQ activityType (400) rather than silently building a session with no prompts.
 * - It runs getAccessibleCourseForActivity, the same course-enrollment gate POST /api/sessions
 *   uses (via its richer link rather than the plain checkActivityAccess wrapper, since the draw
 *   below needs assembledQuizId — see the pool-filtering comment further down). The old route had
 *   no enrollment gate at all, so any authenticated student could start the built-in activity
 *   regardless of which courses they were in.
 * - It draws from one difficulty level and starts at findStartDifficultyLevel's answer instead of
 *   always level 1. user_story.difficulty_level existed, was CHECK-constrained and indexed, and
 *   was read by nothing.
 */
export async function POST(request: Request, { params }: { params: { activityType: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // A bodyless start is the common case — only a replay sends one, so this is not an error.
    body = null;
  }

  const { difficultyLevel, assembledQuizId } = (body ?? {}) as { difficultyLevel?: unknown; assembledQuizId?: unknown };
  const hasReplayLevel = difficultyLevel !== undefined && difficultyLevel !== null;

  if (hasReplayLevel && (typeof difficultyLevel !== 'number' || !Number.isInteger(difficultyLevel) || difficultyLevel < 1)) {
    return Response.json({ error: 'difficultyLevel must be a positive integer.' }, { status: 400 });
  }

  // GitHub #583: optional, same as POST /api/sessions — disambiguates which of possibly several
  // assembled quizzes composing this catalog granted access.
  if (assembledQuizId !== undefined && assembledQuizId !== null && typeof assembledQuizId !== 'string') {
    return Response.json({ error: 'assembledQuizId must be a string.' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { activityType } = params;

  const { gradingKind, error: kindError } = await getGradingKind(supabase, activityType);
  if (kindError) return Response.json({ error: kindError.message }, { status: 500 });
  if (gradingKind === null) return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
  if (gradingKind !== 'llm-graded') {
    return Response.json(
      { error: 'This activity is a multiple-choice quiz — start it with POST /api/sessions.' },
      { status: 400 },
    );
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { link: accessLink, error: accessError } = await getAccessibleCourseForActivity(supabase, activityType, user.id, {
    assembledQuizId: assembledQuizId as string | undefined,
  });
  if (accessError) return Response.json({ error: accessError.message }, { status: 500 });
  if (!accessLink) {
    return Response.json({ error: 'You are not enrolled in a course that offers this activity.' }, { status: 403 });
  }

  const existing = await findInProgressSession(supabase, user.id, activityType, accessLink.assembledQuizId);
  if (existing.error) return Response.json({ error: existing.error.message }, { status: 500 });
  if (existing.session) return respondWithSession(supabase, existing.session, { created: false });

  const { startLevel: allowedLevel, error: levelError } = await findStartDifficultyLevel(
    supabase,
    user.id,
    activityType,
    accessLink.assembledQuizId,
  );
  if (levelError) return Response.json({ error: levelError.message }, { status: 500 });

  let startLevel: number;

  if (hasReplayLevel) {
    if ((difficultyLevel as number) > allowedLevel!) {
      return Response.json({ error: 'You have not passed that difficulty level yet.' }, { status: 403 });
    }
    startLevel = difficultyLevel as number;
  } else {
    startLevel = allowedLevel!;
  }

  const { pool: rawPool, error: poolError } = await loadUserStoryPool(supabase, activityType, startLevel);
  if (poolError) return Response.json({ error: poolError.message }, { status: 500 });

  // A prompt drawn from this catalog can still be individually excluded from the assembled quiz
  // that granted access (quiz_excluded_user_story) — the catalog itself is unaffected, but this
  // specific quiz must never draw an excluded prompt, and an excluded prompt must not count
  // toward whether there are enough to draw from either. Mirrors POST /api/sessions' identical
  // fix for quiz_excluded_question: this was previously missing entirely, so an instructor could
  // exclude a prompt down to fewer than STORIES_PER_SESSION and a student could still start the
  // quiz, drawing from (and being blocked from ever completing) a pool that looked sufficient.
  const { excludedIds, error: excludedError } = await listQuizExcludedUserStoryIds(supabase, accessLink.assembledQuizId);
  if (excludedError) return Response.json({ error: excludedError.message }, { status: 500 });

  const excludedSet = new Set(excludedIds);
  const pool = (rawPool ?? []).filter((story) => !excludedSet.has(story.user_story_id));

  // The level is named in the message on purpose: the pool is per-level now, so "not enough
  // prompts" without a level leaves an instructor checking a catalog that looks well stocked.
  if (pool.length < STORIES_PER_SESSION) {
    return Response.json(
      { error: `At least ${STORIES_PER_SESSION} prompts are required for this activity at difficulty level ${startLevel}.` },
      { status: 400 },
    );
  }

  const picked = shuffleArray(pool).slice(0, STORIES_PER_SESSION);

  const sessionId = crypto.randomUUID();

  const { data: session, error: insertError } = await supabase
    .from('session_log')
    .insert({
      session_id: sessionId,
      user_id: user.id,
      activity_type: activityType,
      assembled_quiz_id: accessLink.assembledQuizId,
      difficulty_level: startLevel,
      status: 'in-progress',
      cumulative_score: 0,
      max_score: sessionMaxScoreForDifficulty(startLevel as 1 | 2 | 3),
      passed: false,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (insertError || !session) {
    // A parallel request won uq_session_log_one_active — return that session instead of failing.
    if (insertError?.code === UNIQUE_VIOLATION) {
      const raced = await findInProgressSession(supabase, user.id, activityType, accessLink.assembledQuizId);
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
    // Without its prompts the session is unusable, and it would block every future start because
    // of uq_session_log_one_active. Remove it rather than leave it stranded.
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
