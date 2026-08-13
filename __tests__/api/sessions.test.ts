import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    deletes: [] as string[],
    tables: [] as string[],
    // Recorded rather than ignored: which column a list is sorted by is part of this
    // endpoint's contract, and a no-op order() would let a wrong one pass unnoticed.
    orders: [] as { table: string; column: string; ascending: boolean }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: (column: string, opts?: { ascending?: boolean }) => {
        state.orders.push({ table, column, ascending: opts?.ascending ?? true });
        return builder;
      },
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
      // PostgrestFilterBuilder is thenable — queries without .single() are awaited directly.
      then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onOk, onErr),
    };
    return builder;
  }

  return { state, makeBuilder };
});

/** Queues the result the next `from(table)` chain resolves to. */
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

import { GET, POST } from '../../app/api/sessions/route';

const sessionRow = {
  session_id: 'session-1',
  user_id: 'user-123',
  activity_type: 'IDENTIFY_WEAK_USER_STORIES',
  difficulty_level: 1,
  started_at: '2026-07-29T10:00:00.000Z',
  ended_at: null,
  status: 'in-progress',
  cumulative_score: 0,
  max_score: 100,
  passed: false,
  badge_id: null,
};

const pool = Array.from({ length: 6 }, (_, i) => ({ question_id: `q-${i + 1}`, max_score: 25 }));

const drawnQuestions = Array.from({ length: 4 }, (_, i) => ({
  position: i,
  question: {
    question_id: `q-${i + 1}`,
    question_prompt: `Prompt ${i + 1}`,
    difficulty_level: 1,
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    max_score: 25,
    question_to_answer: [
      { answer: { answer_id: `a-${i}-1`, option_text: 'Option 1' } },
      { answer: { answer_id: `a-${i}-2`, option_text: 'Option 2' } },
    ],
  },
}));

function req(body?: object, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/sessions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Queues a successful activity_type lookup (GitHub #347: isActivityType is now a DB read). */
function queueValidActivityType(activityType = 'IDENTIFY_WEAK_USER_STORIES') {
  queue('activity_type', { data: { activity_type: activityType }, error: null });
}

/**
 * Queues the activity_type lookup plus the two session_log reads that precede every fresh-draw
 * path: no session in progress (findInProgressSession), and no prior passed sessions
 * (findStartDifficultyLevel), so the draw starts at level 1.
 */
function queueFreshSessionStart() {
  queueValidActivityType();
  queue('session_log', { data: null, error: null }); // findInProgressSession: none in progress
  queue('session_log', { data: [], error: null });   // findStartDifficultyLevel: no prior sessions -> level 1
}

/** Queues a full happy-path draw: no running session, big enough pool, insert, links, reload. */
function queueHappyPath() {
  queueFreshSessionStart();
  queue('question', { data: pool, error: null });                      // question bank
  queue('session_log', { data: sessionRow, error: null });             // insert
  queue('session_to_question', { data: null, error: null });           // insert links
  queue('session_to_question', { data: drawnQuestions, error: null }); // reload for the response
}

describe('POST /api/sessions', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.inserts = [];
    h.state.deletes = [];
    h.state.tables = [];
    h.state.orders = [];
  });

  it('returns 401 without a token', async () => {
    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }, null));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    queueValidActivityType();
    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }, 'bad-token'));
    expect(response.status).toBe(401);
  });

  // AC 4
  it('returns 400 for an unknown activity type', async () => {
    const response = await POST(req({ activityType: 'NOT_A_REAL_ACTIVITY' }));
    expect(response.status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
  });

  // GitHub #347: isActivityType now checks the activity_type table at request time instead of a
  // hardcoded compile-time list, so a quiz an instructor created after the app was built is
  // accepted here too — it reaches the "not enough questions" check below (400, but a different
  // reason), rather than being rejected as "unknown" the way it would under the old union.
  it('accepts an instructor-created activity type that only exists in the activity_type table', async () => {
    queueValidActivityType('MY_CUSTOM_QUIZ');
    queue('session_log', { data: null, error: null }); // no session in progress
    queue('session_log', { data: [], error: null }); // no prior passed sessions
    queue('question', { data: [], error: null }); // no questions seeded yet for this new quiz

    const response = await POST(req({ activityType: 'MY_CUSTOM_QUIZ' }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/at least \d+ questions/i);
  });

  it('returns 500 when the activity_type lookup itself fails, not a 400', async () => {
    queue('activity_type', { data: null, error: { message: 'connection refused' } });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('connection refused');
  });

  it('returns 400 when activityType is missing', async () => {
    const response = await POST(req({}));
    expect(response.status).toBe(400);
  });

  // AC 5
  it('returns 400 when fewer than 4 questions exist for type and difficulty level', async () => {
    queueFreshSessionStart();
    queue('question', { data: pool.slice(0, 3), error: null });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));

    expect(response.status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
  });

  // AC 1 + AC 2 + AC 3
  it('creates a session with 4 distinct questions and the required defaults', async () => {
    queueHappyPath();

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.session).toEqual(sessionRow);
    expect(body.resumed).toBe(false);

    // AC 3: session id plus the 4 questions with their answer options.
    expect(body.session.session_id).toBe('session-1');
    expect(body.questions).toHaveLength(4);
    expect(body.questions[0].options).toHaveLength(2);
    expect(body.questions.map((q: { position: number }) => q.position)).toEqual([0, 1, 2, 3]);

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!
      .payload as Record<string, unknown>;

    // AC 2: server-controlled defaults.
    expect(sessionInsert).toMatchObject({
      user_id: 'user-123',
      activity_type: 'IDENTIFY_WEAK_USER_STORIES',
      difficulty_level: 1,
      status: 'in-progress',
      cumulative_score: 0,
      max_score: 100,
      passed: false,
    });

    // AC 1: exactly 4 distinct questions from the pool, positioned 0..3.
    const links = h.state.inserts.find((i) => i.table === 'session_to_question')!
      .payload as { question_id: string; position: number }[];

    expect(links).toHaveLength(4);
    expect(new Set(links.map((l) => l.question_id)).size).toBe(4);
    expect(links.map((l) => l.position)).toEqual([0, 1, 2, 3]);
    links.forEach((l) => expect(pool.map((q) => q.question_id)).toContain(l.question_id));
  });

  it('starts the next session at the next difficulty level once the current one is passed', async () => {
    queueValidActivityType();
    queue('session_log', { data: null, error: null }); // no session in progress
    queue('session_log', {
      data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, passed: true }],
      error: null,
    }); // prior passed level-1 session
    queue('question', { data: pool, error: null });
    queue('session_log', { data: { ...sessionRow, difficulty_level: 2 }, error: null }); // insert
    queue('session_to_question', { data: null, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));
    expect(response.status).toBe(201);

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!
      .payload as Record<string, unknown>;
    expect(sessionInsert).toMatchObject({ difficulty_level: 2 });
  });

  it('caps the next session at MAX_DIFFICULTY_LEVEL once the top level is already passed', async () => {
    queueValidActivityType();
    queue('session_log', { data: null, error: null }); // no session in progress
    queue('session_log', {
      data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 3, passed: true }],
      error: null,
    }); // prior passed level-3 (top) session
    queue('question', { data: pool, error: null });
    queue('session_log', { data: { ...sessionRow, difficulty_level: 3 }, error: null }); // insert
    queue('session_to_question', { data: null, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));
    expect(response.status).toBe(201);

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!
      .payload as Record<string, unknown>;
    expect(sessionInsert).toMatchObject({ difficulty_level: 3 });
  });

  // Replay: a student may choose any level they have already passed instead of the auto-advance
  // level, to practice an easier one without being forced back to level 1 or stuck at the current
  // level. The ceiling for the override is the auto-advance level itself (findStartDifficultyLevel),
  // not just already-passed levels, so a level shown as "next" in the picker is a legal request too.
  it('accepts a requested difficultyLevel at or below the highest passed level', async () => {
    queue('session_log', { data: null, error: null }); // no session in progress
    queue('session_log', {
      data: [
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, passed: true },
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 2, passed: true },
      ],
      error: null,
    }); // highestPassedLevel: 2 — auto-advance would draw level 3
    const level1Pool = Array.from({ length: 4 }, (_, i) => ({ question_id: `L1-q-${i + 1}`, max_score: 25 }));
    queue('question', { data: level1Pool, error: null });
    queue('session_log', { data: { ...sessionRow, difficulty_level: 1 }, error: null }); // insert
    queue('session_to_question', { data: null, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 1 }));
    expect(response.status).toBe(201);

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!
      .payload as Record<string, unknown>;
    // The replayed level, not 3 (what auto-advance would have picked).
    expect(sessionInsert).toMatchObject({ difficulty_level: 1 });

    // The draw pulled from the requested level's own pool.
    const links = h.state.inserts.find((i) => i.table === 'session_to_question')!
      .payload as { question_id: string }[];
    links.forEach((l) => expect(level1Pool.map((q) => q.question_id)).toContain(l.question_id));
  });

  it('accepts a requested difficultyLevel equal to the auto-advance level, even though it was never passed', async () => {
    queue('session_log', { data: null, error: null }); // no session in progress
    queue('session_log', {
      data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, passed: true }],
      error: null,
    }); // highestPassedLevel: 1 -> auto-advance ceiling is 2
    queue('question', { data: pool, error: null });
    queue('session_log', { data: { ...sessionRow, difficulty_level: 2 }, error: null }); // insert
    queue('session_to_question', { data: null, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 2 }));
    expect(response.status).toBe(201);

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!
      .payload as Record<string, unknown>;
    expect(sessionInsert).toMatchObject({ difficulty_level: 2 });
  });

  it('accepts a requested difficultyLevel of 1 when nothing has been passed yet', async () => {
    queue('session_log', { data: null, error: null }); // no session in progress
    queue('session_log', { data: [], error: null }); // nothing passed -> auto-advance ceiling is 1
    queue('question', { data: pool, error: null });
    queue('session_log', { data: sessionRow, error: null }); // insert
    queue('session_to_question', { data: null, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 1 }));
    expect(response.status).toBe(201);

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!
      .payload as Record<string, unknown>;
    expect(sessionInsert).toMatchObject({ difficulty_level: 1 });
  });

  it('rejects a requested difficultyLevel above the auto-advance ceiling', async () => {
    queue('session_log', { data: null, error: null }); // no session in progress
    queue('session_log', {
      data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, passed: true }],
      error: null,
    }); // highestPassedLevel: 1 -> auto-advance ceiling is 2

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 3 }));

    expect(response.status).toBe(403);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('rejects a requested difficultyLevel above the ceiling when nothing has been passed yet', async () => {
    queue('session_log', { data: null, error: null }); // no session in progress
    queue('session_log', { data: [], error: null }); // nothing passed -> auto-advance ceiling is 1

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 2 }));

    expect(response.status).toBe(403);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns 400 for a malformed difficultyLevel', async () => {
    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 0 }));

    expect(response.status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('never exposes is_correct in the response', async () => {
    queueHappyPath();

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain('is_correct');
    // Order isn't asserted here — GitHub #129 has loadSessionQuestions shuffle options, so only
    // the set (and the shape: no is_correct/explanation) is guaranteed, not a fixed position.
    expect(body.questions[0].options).toHaveLength(2);
    expect(body.questions[0].options).toEqual(
      expect.arrayContaining([
        { answer_id: 'a-0-1', option_text: 'Option 1' },
        { answer_id: 'a-0-2', option_text: 'Option 2' },
      ]),
    );
  });

  // AC 6
  it('ignores a user_id supplied in the request body', async () => {
    queueHappyPath();

    await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES', user_id: 'attacker-999', userId: 'attacker-999' }));

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!
      .payload as Record<string, unknown>;

    expect(sessionInsert.user_id).toBe('user-123');
  });

  // REQ-PL-2.1: start and resume are the same, idempotent call.
  it('returns the running session instead of creating a second one', async () => {
    queueValidActivityType();
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumed).toBe(true);
    expect(body.session).toEqual(sessionRow);
    expect(body.questions).toHaveLength(4);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns the winning session when a parallel request hit the unique index', async () => {
    queueFreshSessionStart();
    queue('question', { data: pool, error: null });
    queue('session_log', { data: null, error: { code: '23505', message: 'duplicate key' } });
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumed).toBe(true);
    expect(body.session).toEqual(sessionRow);
  });

  // session_log.user_id references "user"(user_id) — an auth account alone is not enough.
  it('returns 409 when the student has no profile row yet', async () => {
    queueFreshSessionStart();
    queue('question', { data: pool, error: null });
    queue('session_log', {
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint fk_session_log_user' },
    });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/profile/i);
  });

  // GitHub #124: session_log's other foreign keys (activity_type from #123, badge) must not be
  // misreported as the profile case just because they share the 23503 code.
  it('returns 500, not the profile message, for an unrelated foreign key violation', async () => {
    queueFreshSessionStart();
    queue('question', { data: pool, error: null });
    queue('session_log', {
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint fk_session_log_activity_type' },
    });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/activity_type/i);
    expect(body.error).not.toMatch(/profile/i);
  });

  it('removes the session when its questions could not be stored', async () => {
    queueFreshSessionStart();
    queue('question', { data: pool, error: null });
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_question', { data: null, error: { message: 'insert failed' } });

    const response = await POST(req({ activityType: 'IDENTIFY_WEAK_USER_STORIES' }));

    expect(response.status).toBe(500);
    // Otherwise the empty session would block every future start via uq_session_log_one_active.
    expect(h.state.deletes).toContain('session_log');
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await POST(
      new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer valid-token' },
        body: '{ not json',
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe('GET /api/sessions', () => {
  const OTHER_ACTIVITY = 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA';

  const secondSession = {
    ...sessionRow,
    session_id: 'session-2',
    activity_type: OTHER_ACTIVITY,
    cumulative_score: 25,
  };

  function listReq(query = '', token: string | null = 'valid-token') {
    return new Request(`http://localhost/api/sessions${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  /** Two running sessions: session-1 has 2 of 4 answered, session-2 none. */
  function queueTwoRunningSessions() {
    queue('session_log', { data: [sessionRow, secondSession], error: null });
    queue('session_to_question', {
      data: [
        ...Array.from({ length: 4 }, (_, i) => ({ session_id: 'session-1', position: i, question_id: `q-${i + 1}` })),
        ...Array.from({ length: 4 }, (_, i) => ({ session_id: 'session-2', position: i, question_id: `p-${i + 1}` })),
      ],
      error: null,
    });
    queue('answered_question_log', {
      data: [
        { session_id: 'session-1', question_id: 'q-1' },
        { session_id: 'session-1', question_id: 'q-2' },
      ],
      error: null,
    });
  }

  beforeEach(() => {
    h.state.queues = {};
    h.state.inserts = [];
    h.state.deletes = [];
    h.state.tables = [];
    h.state.orders = [];
  });

  it('returns 401 without a token', async () => {
    expect((await GET(listReq('', null))).status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    expect((await GET(listReq('', 'bad-token'))).status).toBe(401);
  });

  it('returns 400 for an unknown status filter', async () => {
    expect((await GET(listReq('?status=paused'))).status).toBe(400);
  });

  it('returns an empty list when nothing is running', async () => {
    queue('session_log', { data: [], error: null });

    const response = await GET(listReq());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toEqual([]);
    // No session ids, so the progress queries are skipped entirely.
    expect(h.state.tables).toEqual(['session_log']);
  });

  it('lists running sessions with their own progress', async () => {
    queueTwoRunningSessions();

    const response = await GET(listReq());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(2);

    expect(body.sessions[0]).toMatchObject({
      session_id: 'session-1',
      activity_type: 'IDENTIFY_WEAK_USER_STORIES',
      status: 'in-progress',
      cumulative_score: 0,
      questionCount: 4,
      answeredCount: 2,
      nextPosition: 2,
    });

    expect(body.sessions[1]).toMatchObject({
      session_id: 'session-2',
      activity_type: OTHER_ACTIVITY,
      questionCount: 4,
      answeredCount: 0,
      nextPosition: 0,
    });
  });

  // One list query plus four batched progress queries (Type A's two plus Write Acceptance
  // Criteria's two, merged by loadProgressForSessions regardless of which activity type each
  // session actually is), no matter how many sessions.
  it('does not query per session', async () => {
    queueTwoRunningSessions();

    await GET(listReq());

    expect(h.state.tables).toEqual([
      'session_log',
      'session_to_question',
      'answered_question_log',
      'session_to_user_story',
      'submission',
    ]);
  });

  it('never exposes questions or solutions in the list', async () => {
    queueTwoRunningSessions();

    const body = await (await GET(listReq())).json();

    expect(JSON.stringify(body)).not.toContain('is_correct');
    expect(JSON.stringify(body)).not.toContain('option_text');
    expect(body.sessions[0]).not.toHaveProperty('questions');
  });

  // The same endpoint serves the completed-activity history (REQ-PL).
  it('accepts a status filter for completed sessions', async () => {
    queue('session_log', {
      data: [{ ...sessionRow, status: 'completed', cumulative_score: 100, passed: true }],
      error: null,
    });
    queue('session_to_question', {
      data: Array.from({ length: 4 }, (_, i) => ({ session_id: 'session-1', position: i, question_id: `q-${i + 1}` })),
      error: null,
    });
    queue('answered_question_log', {
      data: Array.from({ length: 4 }, (_, i) => ({ session_id: 'session-1', question_id: `q-${i + 1}` })),
      error: null,
    });

    const body = await (await GET(listReq('?status=completed'))).json();

    expect(body.sessions[0]).toMatchObject({
      status: 'completed',
      passed: true,
      answeredCount: 4,
      nextPosition: null,
    });
  });

  /** Only the session_log ordering — the progress lookups sort on their own columns. */
  function sessionOrdering() {
    return h.state.orders.filter((o) => o.table === 'session_log').map((o) => [o.column, o.ascending]);
  }

  // The list is cut short by callers (the dashboard shows three), so the wrong sort order
  // does not just misplace an entry — it can drop the newest one entirely.
  it('sorts completed sessions by when they ended', async () => {
    queue('session_log', { data: [], error: null });

    await GET(listReq('?status=completed'));

    expect(sessionOrdering()).toEqual([
      ['ended_at', false],
      ['started_at', false],
    ]);
  });

  // ended_at is null while a session runs, so there is nothing to sort on.
  it('sorts running sessions by when they started', async () => {
    queue('session_log', { data: [], error: null });

    await GET(listReq());

    expect(sessionOrdering()).toEqual([['started_at', false]]);
  });

  // Abandoning sets ended_at too, so the split is running vs. over — not completed vs. the rest.
  it('sorts abandoned sessions by when they ended', async () => {
    queue('session_log', { data: [], error: null });

    await GET(listReq('?status=abandoned'));

    expect(sessionOrdering()).toEqual([
      ['ended_at', false],
      ['started_at', false],
    ]);
  });

  it('returns 500 when the progress lookup fails', async () => {
    queue('session_log', { data: [sessionRow], error: null });
    queue('session_to_question', { data: null, error: { message: 'boom' } });
    queue('answered_question_log', { data: [], error: null });

    expect((await GET(listReq())).status).toBe(500);
  });
});
