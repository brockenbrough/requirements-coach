import { getSupabaseClient } from '../../../lib/supabase';
import { isActivityType } from '../../../lib/activityTypes';
import { checkActivityAccess } from '../../../lib/activityCourseQueries';
import {
  DEFAULT_QUESTION_MAX_SCORE,
  QUESTIONS_PER_SESSION,
  SESSION_COLUMNS,
  isSessionStatus,
} from '../../../lib/sessionRules';
import {
  type SupabaseClient,
  findInProgressSession,
  findStartDifficultyLevel,
  loadProgressForSessions,
  loadSessionQuestions,
} from '../../../lib/sessionQueries';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * GET /api/sessions — the student's own sessions for a status page.
 *
 * Defaults to the running ones. Each row carries its own progress (how many of the drawn
 * questions are answered, where to continue) so the page can render a list without calling
 * /api/sessions/current once per activity.
 *
 * Newest first, by the timestamp that matters for the requested status: ended_at for sessions
 * that are over, started_at for those still running. Callers that cut the list short — the
 * dashboard shows the three most recent — therefore get the right ones, which they could not
 * fix up themselves after the fact.
 *
 * Questions and answers are deliberately not included: a list view does not need them, and
 * shipping the options of every open session just to draw progress bars is wasteful.
 */
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const status = new URL(request.url).searchParams.get('status') ?? 'in-progress';

  if (!isSessionStatus(status)) {
    return Response.json({ error: 'Unknown session status.' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  // Scoped to the authenticated student — there is no way to ask for someone else's sessions.
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const query = supabase
    .from('session_log')
    .select(SESSION_COLUMNS)
    .eq('user_id', user.id)
    .eq('status', status);

  // A session that is over is placed by when it ended, one that is still running by when it
  // started — a finished attempt is "recent" because of when it finished, and that is also the
  // date a history shows. 'abandoned' sets ended_at just like 'completed' does, so the split is
  // running vs. over, not completed vs. the rest.
  //
  // started_at as a tiebreaker for the same reason as in loadCompletedAttempts: Postgres orders
  // DESC as NULLS FIRST, so a finished row without ended_at would otherwise jump to the top.
  const { data: rows, error } = await (status === 'in-progress'
    ? query.order('started_at', { ascending: false })
    : query.order('ended_at', { ascending: false }).order('started_at', { ascending: false }));

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const sessions = (rows ?? []) as { session_id: string }[];

  const { progress, error: progressError } = await loadProgressForSessions(
    supabase,
    sessions.map((session) => session.session_id),
  );

  if (progressError) return Response.json({ error: progressError.message }, { status: 500 });

  return Response.json(
    {
      // Picked field by field rather than spread: loadProgressForSessions also carries the
      // drawn question ids, and a list view has no use for them.
      sessions: sessions.map((session) => {
        const sessionProgress = progress!.get(session.session_id);

        return {
          ...session,
          questionCount: sessionProgress?.questionCount ?? 0,
          answeredCount: sessionProgress?.answeredCount ?? 0,
          nextPosition: sessionProgress?.nextPosition ?? null,
        };
      }),
    },
    { status: 200 },
  );
}

/**
 * POST /api/sessions — starts a Type A activity, or returns the one already in progress.
 *
 * Idempotent by design (REQ-PL-2.1): a student can hold at most one in-progress session per
 * activity type, enforced by uq_session_log_one_active. "Start" and "resume" are the same
 * call; the `resumed` flag tells the client whether to offer continue/abandon.
 */
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { activityType, difficultyLevel } = (body ?? {}) as { activityType?: unknown; difficultyLevel?: unknown };

  // AC 4: unknown activity type is a client error. Narrows activityType to string for the rest
  // of the function — isActivityType's async check below can no longer double as a type
  // predicate the way the old synchronous version did.
  if (typeof activityType !== 'string') {
    return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
  }

  // Replay override (optional): a student may ask to start at a specific level instead of the
  // computed next-unpassed one, but never past it — a malformed value is a bad request, but
  // "you haven't earned this level yet" is an authorization failure, not one.
  const hasReplayLevel = difficultyLevel !== undefined;
  if (hasReplayLevel && (typeof difficultyLevel !== 'number' || !Number.isInteger(difficultyLevel) || difficultyLevel < 1)) {
    return Response.json({ error: 'Invalid difficulty level.' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { valid: validActivityType, error: activityTypeError } = await isActivityType(supabase, activityType);
  if (activityTypeError) return Response.json({ error: activityTypeError.message }, { status: 500 });
  if (!validActivityType) {
    return Response.json({ error: 'Unknown activity type.' }, { status: 400 });
  }

  // AC 6: the student id comes from the auth session, never from the request body.
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  // Every activity now belongs to exactly one course (activity_type_course) — a student can only
  // start a session against one whose course they're enrolled in. Checked here rather than
  // folded into isActivityType above: "does this exist" and "can this caller see it" are
  // different questions, and only the second one needs the caller's identity.
  const access = await checkActivityAccess(supabase, activityType, user.id);
  if (access.status === 'error') return Response.json({ error: access.error.message }, { status: 500 });
  if (access.status === 'forbidden') {
    return Response.json({ error: 'You are not enrolled in a course that offers this activity.' }, { status: 403 });
  }

  const existing = await findInProgressSession(supabase, user.id, activityType);
  if (existing.error) return Response.json({ error: existing.error.message }, { status: 500 });
  if (existing.session) return respondWithSession(supabase, existing.session, { created: false });

  // The student's next unpassed level for this activity: one past the highest difficulty_level
  // they've passed, capped at MAX_DIFFICULTY_LEVEL. No prior passed session -> level 1. This is
  // also the ceiling a replay override may request — any already-passed level, or this exact
  // auto-advance level, but never past it.
  const { startLevel: allowedLevel, error: levelError } = await findStartDifficultyLevel(supabase, user.id, activityType);
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

  // AC 1: draw QUESTIONS_PER_SESSION questions matching activity type and the computed level.
  // GitHub #124: filtered through an inner join against the activity_type table (#122/#123)
  // instead of a plain equality check on the free-text column.
  const { data: pool, error: poolError } = await supabase
    .from('question')
    .select('question_id, max_score, activity:activity_type!inner ( activity_type )')
    .eq('activity.activity_type', activityType)
    .eq('difficulty_level', startLevel);

  if (poolError) return Response.json({ error: poolError.message }, { status: 500 });

  // AC 5: too small a question bank is a client error, not an empty session.
  if (!pool || pool.length < QUESTIONS_PER_SESSION) {
    return Response.json(
      { error: `At least ${QUESTIONS_PER_SESSION} questions are required for this activity type and difficulty level.` },
      { status: 400 },
    );
  }

  const picked = shuffle(pool as { question_id: string; max_score: number | null }[])
    .slice(0, QUESTIONS_PER_SESSION);

  // Keep max_score consistent with the questions actually drawn — 4 x 25 = the 100 from AC 2.
  const maxScore = picked.reduce((sum, q) => sum + (q.max_score ?? DEFAULT_QUESTION_MAX_SCORE), 0);

  // session_log.session_id has no DEFAULT, so the id is generated here.
  const sessionId = crypto.randomUUID();

  // AC 2: defaults are set by the server; the client cannot influence score, status or passed.
  const { data: session, error: insertError } = await supabase
    .from('session_log')
    .insert({
      session_id: sessionId,
      user_id: user.id,
      activity_type: activityType,
      difficulty_level: startLevel,
      status: 'in-progress',
      cumulative_score: 0,
      max_score: maxScore,
      passed: false,
    })
    .select(SESSION_COLUMNS)
    .single();

  if (insertError || !session) {
    // A parallel request won the unique index — return that session instead of failing.
    if (insertError?.code === UNIQUE_VIOLATION) {
      const raced = await findInProgressSession(supabase, user.id, activityType);
      if (raced.session) return respondWithSession(supabase, raced.session, { created: false });
    }
    // session_log.user_id references "user"(user_id): the student is authenticated but has
    // no profile row yet, so there is nothing to hang the session on.
    //
    // GitHub #124: session_log also has fk_session_log_activity_type (#123), which raises the
    // same 23503 code. activityType is already validated against lib/activityTypes.ts above, so
    // that FK should never actually fire here — but if the activity_type table and that list
    // ever drift, it must not be misreported as a missing profile. Only the user FK gets the
    // friendly 409; anything else falls through to the generic 500 below with the real error
    // message.
    if (insertError?.code === FOREIGN_KEY_VIOLATION && insertError.message.includes('fk_session_log_user')) {
      return Response.json(
        { error: 'Create a profile before starting an activity.' },
        { status: 409 },
      );
    }
    return Response.json({ error: insertError?.message ?? 'Could not create session.' }, { status: 500 });
  }

  const { error: linkError } = await supabase
    .from('session_to_question')
    .insert(picked.map((question, index) => ({
      session_id: sessionId,
      question_id: question.question_id,
      position: index,
    })));

  if (linkError) {
    // Without its questions the session is unusable, and it would block every future start
    // because of uq_session_log_one_active. Remove it rather than leave it stranded.
    await supabase.from('session_log').delete().eq('session_id', sessionId);
    return Response.json({ error: linkError.message }, { status: 500 });
  }

  return respondWithSession(supabase, session, { created: true });
}

// AC 3: the response carries the session record plus the drawn questions with their options.
async function respondWithSession(supabase: SupabaseClient, session: unknown, { created }: { created: boolean }) {
  const sessionId = (session as { session_id: string }).session_id;
  const { questions, error } = await loadSessionQuestions(supabase, sessionId);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(
    { session, questions, resumed: !created },
    { status: created ? 201 : 200 },
  );
}
