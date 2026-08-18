import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same hoisted queue-per-table harness as the MCQ sessions test, plus `in`/`limit` so
// getAccessibleCourseForActivity's chain resolves.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    deletes: [] as string[],
    tables: [] as string[],
    filters: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      in: () => builder,
      limit: () => builder,
      order: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      delete: () => {
        state.deletes.push(table);
        return builder;
      },
      maybeSingle: async () => result,
      single: async () => result,
      then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onOk, onErr),
    };
    return builder;
  }

  return { state, makeBuilder };
});

function queue(table: string, result: Result) {
  (h.state.queues[table] ??= []).push(result);
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-123' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { POST } from '../../app/api/activities/[activityType]/llm/sessions/route';

const ACTIVITY = 'WRITE_ACCEPTANCE_CRITERIA';
const PARAMS = (activityType: string = ACTIVITY) => ({ params: { activityType } });

const sessionRow = {
  session_id: 'llm-session-1',
  user_id: 'user-123',
  activity_type: ACTIVITY,
  difficulty_level: 1,
  started_at: '2026-07-29T10:00:00.000Z',
  ended_at: null,
  status: 'in-progress',
  cumulative_score: 0,
  max_score: 40,
  passed: false,
};

const pool = Array.from({ length: 6 }, (_, i) => ({ user_story_id: `story-${i + 1}` }));

const drawnStories = Array.from({ length: 4 }, (_, i) => ({
  position: i,
  story: { user_story_id: `story-${i + 1}`, story_text: `As a user, I want ${i + 1}...` },
}));

function req(body?: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/activities/WRITE_ACCEPTANCE_CRITERIA/llm/sessions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function queueGradingKind(gradingKind: string | null) {
  queue('activity_type', { data: gradingKind === null ? null : { grading_kind: gradingKind }, error: null });
}

/**
 * checkActivityAccess: the caller is enrolled in a course, and some assembled_quiz in that course
 * composes this catalog. getAccessibleCourseForActivity queries student_course (the caller's own
 * enrolled courses) before assembled_quiz_catalog, so student_course is queued first here too.
 */
function queueEnrolled() {
  queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
  queue('assembled_quiz_catalog', {
    data: [{ assembled_quiz: { assembled_quiz_id: 'quiz-1', course_id: 'course-1', course: { course_name: 'SE' } } }],
    error: null,
  });
}

/**
 * The full happy path, in the exact query order the route makes them:
 * grading kind -> course link -> enrollment -> in-progress lookup -> passed history -> pool ->
 * insert -> link insert -> reload.
 */
function queueHappyPath({ passedHistory = [] as unknown[] } = {}) {
  queueGradingKind('llm-graded');
  queueEnrolled();
  queue('session_log', { data: null, error: null });                    // nothing in progress
  queue('session_log', { data: passedHistory, error: null });           // findStartDifficultyLevel
  queue('user_story', { data: pool, error: null });                     // level-scoped pool
  queue('session_log', { data: sessionRow, error: null });              // insert
  queue('session_to_user_story', { data: null, error: null });          // insert links
  queue('session_to_user_story', { data: drawnStories, error: null });  // reload for the response
}

beforeEach(() => {
  h.state.queues = {};
  h.state.inserts = [];
  h.state.deletes = [];
  h.state.tables = [];
  h.state.filters = [];
});

describe('POST /api/activities/[activityType]/llm/sessions', () => {
  it('returns 401 without a token, before any query', async () => {
    expect((await POST(req(undefined, null), PARAMS())).status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    queueGradingKind('llm-graded');
    expect((await POST(req(undefined, 'bad-token'), PARAMS())).status).toBe(401);
  });

  it('returns 400 for an activity type that matches no catalog', async () => {
    queueGradingKind(null);

    const response = await POST(req(), PARAMS('NOPE'));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/unknown activity type/i);
    expect(h.state.inserts).toHaveLength(0);
  });

  // The route this replaced could not tell the two kinds apart at all; sending an MCQ key here
  // would have built a session with no prompts to draw.
  it('returns 400 for a multiple-choice activity type', async () => {
    queueGradingKind('mcq');

    const response = await POST(req(), PARAMS('IDENTIFY_WEAK_USER_STORIES'));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/multiple-choice/i);
    expect(h.state.inserts).toHaveLength(0);
  });

  // The gate the hardcoded route never had: enrollment is the entire visibility rule for a
  // course-scoped activity.
  it('returns 403 when no assembled quiz composes this catalog for a course the caller is in', async () => {
    queueGradingKind('llm-graded');
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', { data: [], error: null });

    const response = await POST(req(), PARAMS());

    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/not enrolled/i);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns 403 when the caller is not enrolled in the course that grants access', async () => {
    queueGradingKind('llm-graded');
    // Enrolled, but in a different course than the one whose assembled quiz composes this catalog.
    queue('student_course', { data: [{ course_id: 'course-2' }], error: null });
    queue('assembled_quiz_catalog', { data: [], error: null });

    const response = await POST(req(), PARAMS());

    expect(response.status).toBe(403);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns 400 when the level has fewer than STORIES_PER_SESSION prompts, naming the level', async () => {
    queueGradingKind('llm-graded');
    queueEnrolled();
    queue('session_log', { data: null, error: null });
    queue('session_log', { data: [], error: null });
    queue('user_story', { data: pool.slice(0, 3), error: null });

    const response = await POST(req(), PARAMS());

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/difficulty level 1/i);
    expect(h.state.inserts).toHaveLength(0);
  });

  // Regression: the draw used to query `user_story` straight from the catalog with no awareness
  // of any assembled quiz's quiz_excluded_user_story rows, so an excluded prompt kept getting
  // drawn (and counted toward the STORIES_PER_SESSION minimum) even after an instructor excluded
  // it — mirrors POST /api/sessions' identical fix for quiz_excluded_question.
  it('never draws a prompt the granting quiz has excluded', async () => {
    queueGradingKind('llm-graded');
    queueEnrolled();
    queue('session_log', { data: null, error: null });
    queue('session_log', { data: [], error: null });
    queue('user_story', { data: pool, error: null }); // 6 in the catalog
    queue('quiz_excluded_user_story', { data: [{ user_story_id: 'story-5' }, { user_story_id: 'story-6' }], error: null });
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: null, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });

    const response = await POST(req(), PARAMS());

    expect(response.status).toBe(201);
    const [{ payload }] = h.state.inserts.filter((i) => i.table === 'session_to_user_story');
    const drawnIds = (payload as { user_story_id: string }[]).map((row) => row.user_story_id);
    expect(drawnIds).not.toContain('story-5');
    expect(drawnIds).not.toContain('story-6');
  });

  it('returns 400 when exclusions push the catalog below the minimum, even though it has enough prompts total', async () => {
    queueGradingKind('llm-graded');
    queueEnrolled();
    queue('session_log', { data: null, error: null });
    queue('session_log', { data: [], error: null });
    queue('user_story', { data: pool, error: null }); // 6 in the catalog
    // Only 3 remain once the granting quiz's exclusions are applied.
    queue('quiz_excluded_user_story', {
      data: [{ user_story_id: 'story-1' }, { user_story_id: 'story-2' }, { user_story_id: 'story-3' }],
      error: null,
    });

    const response = await POST(req(), PARAMS());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/at least \d+ prompts/i);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('creates a session with 4 distinct prompts and the required defaults', async () => {
    queueHappyPath();

    const response = await POST(req(), PARAMS());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.session).toEqual(sessionRow);
    expect(body.resumed).toBe(false);
    expect(body.stories).toHaveLength(4);
    expect(body.stories.map((s: { position: number }) => s.position)).toEqual([0, 1, 2, 3]);

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!.payload as Record<string, unknown>;

    expect(sessionInsert).toMatchObject({
      user_id: 'user-123',
      activity_type: ACTIVITY,
      difficulty_level: 1,
      status: 'in-progress',
      cumulative_score: 0,
      max_score: 80,
      passed: false,
    });

    const links = h.state.inserts.find((i) => i.table === 'session_to_user_story')!
      .payload as { user_story_id: string; position: number }[];

    expect(links).toHaveLength(4);
    expect(new Set(links.map((l) => l.user_story_id)).size).toBe(4);
    expect(links.map((l) => l.position)).toEqual([0, 1, 2, 3]);
  });

  // Persisted so POST .../llm/submissions can later resolve *this same* quiz's rating_prompt to
  // grade against, rather than re-deriving "some" accessible quiz at grading time — see
  // session_log.assembled_quiz_id's own comment in supabase/schema.sql.
  it('persists the granting assembled quiz on the new session, for later rubric resolution', async () => {
    queueHappyPath();

    await POST(req(), PARAMS());

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!.payload as Record<string, unknown>;
    expect(sessionInsert).toMatchObject({ assembled_quiz_id: 'quiz-1' });
  });

  it('draws from the activity type in the path, not a fixed one', async () => {
    queueHappyPath();

    await POST(req(), PARAMS('MY_WRITING_TASK'));

    expect(h.state.filters).toContainEqual({ table: 'user_story', column: 'activity_type', value: 'MY_WRITING_TASK' });
  });

  // The behavior change this issue accepts: the draw is level-scoped now, and the level comes
  // from the student's own passed history rather than always being 1.
  it('starts one level past the highest passed level and draws only that level', async () => {
    queueHappyPath({
      passedHistory: [{ activity_type: ACTIVITY, difficulty_level: 1, passed: true }],
    });

    await POST(req(), PARAMS());

    expect(h.state.filters).toContainEqual({ table: 'user_story', column: 'difficulty_level', value: 2 });

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!.payload as Record<string, unknown>;
    expect(sessionInsert.difficulty_level).toBe(2);
  });

  it('honors a replay of an already-passed level', async () => {
    queueHappyPath({
      passedHistory: [
        { activity_type: ACTIVITY, difficulty_level: 1, passed: true },
        { activity_type: ACTIVITY, difficulty_level: 2, passed: true },
      ],
    });

    await POST(req({ difficultyLevel: 1 }), PARAMS());

    expect(h.state.filters).toContainEqual({ table: 'user_story', column: 'difficulty_level', value: 1 });
  });

  it('returns 403 for a replay level past the auto-advance ceiling', async () => {
    queueGradingKind('llm-graded');
    queueEnrolled();
    queue('session_log', { data: null, error: null });
    queue('session_log', { data: [], error: null });

    const response = await POST(req({ difficultyLevel: 3 }), PARAMS());

    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/have not passed/i);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns 400 for a non-integer replay level', async () => {
    const response = await POST(req({ difficultyLevel: 'two' }), PARAMS());
    expect(response.status).toBe(400);
    expect(h.state.tables).toEqual([]);
  });

  // Start and resume are the same, idempotent call — unchanged from the route this replaces.
  it('returns the running session instead of creating a second one', async () => {
    queueGradingKind('llm-graded');
    queueEnrolled();
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });

    const response = await POST(req(), PARAMS());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumed).toBe(true);
    expect(body.session).toEqual(sessionRow);
    expect(body.stories).toHaveLength(4);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns the winning session when a parallel request hit the unique index', async () => {
    queueGradingKind('llm-graded');
    queueEnrolled();
    queue('session_log', { data: null, error: null });
    queue('session_log', { data: [], error: null });
    queue('user_story', { data: pool, error: null });
    queue('session_log', { data: null, error: { code: '23505', message: 'duplicate key' } });
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });

    const response = await POST(req(), PARAMS());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumed).toBe(true);
  });

  it('returns 409 when the student has no profile row yet', async () => {
    queueGradingKind('llm-graded');
    queueEnrolled();
    queue('session_log', { data: null, error: null });
    queue('session_log', { data: [], error: null });
    queue('user_story', { data: pool, error: null });
    queue('session_log', {
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint fk_session_log_user' },
    });

    const response = await POST(req(), PARAMS());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/profile/i);
  });

  it('removes the session when its prompts could not be stored', async () => {
    queueGradingKind('llm-graded');
    queueEnrolled();
    queue('session_log', { data: null, error: null });
    queue('session_log', { data: [], error: null });
    queue('user_story', { data: pool, error: null });
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: null, error: { message: 'insert failed' } });

    const response = await POST(req(), PARAMS());

    expect(response.status).toBe(500);
    // Otherwise the empty session would block every future start via uq_session_log_one_active.
    expect(h.state.deletes).toContain('session_log');
  });
});
