import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
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

import { GET } from '../../app/api/sessions/in-progress/route';

const ACTIVITY_TYPE = 'IDENTIFY_WEAK_USER_STORIES';

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 'session-1',
    user_id: 'user-123',
    activity_type: ACTIVITY_TYPE,
    difficulty_level: 1,
    started_at: '2026-07-29T10:00:00.000Z',
    ended_at: null,
    status: 'in-progress',
    cumulative_score: 50,
    max_score: 100,
    passed: false,
    ...overrides,
  };
}

/** The 4 drawn questions of session-1, deliberately queued out of order. */
const drawnQuestions = [
  { session_id: 'session-1', position: 2, question_id: 'q-3' },
  { session_id: 'session-1', position: 0, question_id: 'q-1' },
  { session_id: 'session-1', position: 3, question_id: 'q-4' },
  { session_id: 'session-1', position: 1, question_id: 'q-2' },
];

/** Queues a successful activity_type lookup (GitHub #347: isActivityType is now a DB read). */
function queueValidActivityType(activityType = ACTIVITY_TYPE) {
  queue('activity_type', { data: { activity_type: activityType }, error: null });
}

function req(query = '', token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/sessions/in-progress${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/sessions/in-progress', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.inserts = [];
    h.state.tables = [];
  });

  it('returns 401 without a token', async () => {
    expect((await GET(req(`?activityType=${ACTIVITY_TYPE}`, null))).status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    queueValidActivityType();
    expect((await GET(req(`?activityType=${ACTIVITY_TYPE}`, 'bad-token'))).status).toBe(401);
  });

  it('returns 400 for an unknown activity type', async () => {
    const response = await GET(req('?activityType=NOT_AN_ACTIVITY'));

    expect(response.status).toBe(400);
    // The lookup itself still ran (against the activity_type table) — it just found nothing.
    expect(h.state.tables).toEqual(['activity_type']);
  });

  // AC 1: status, difficulty level, cumulative score, the 4 question ids, last question index.
  it('returns the in-progress session for the activity type', async () => {
    queueValidActivityType();
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });
    queue('answered_question_log', {
      data: [
        { session_id: 'session-1', question_id: 'q-1' },
        { session_id: 'session-1', question_id: 'q-2' },
      ],
      error: null,
    });

    const response = await GET(req(`?activityType=${ACTIVITY_TYPE}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({
      session_id: 'session-1',
      status: 'in-progress',
      difficulty_level: 1,
      cumulative_score: 50,
      answeredCount: 2,
      questionCount: 4,
      nextPosition: 2,
    });
    // Presentation order, not the order the rows came back in.
    expect(body.sessions[0].questionIds).toEqual(['q-1', 'q-2', 'q-3', 'q-4']);
    expect(body.sessions[0].lastQuestionIndex).toBe(1);
  });

  it('reports a null last question index while nothing is answered', async () => {
    queueValidActivityType();
    queue('session_log', { data: [sessionRow({ cumulative_score: 0 })], error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });
    queue('answered_question_log', { data: [], error: null });

    const body = await (await GET(req(`?activityType=${ACTIVITY_TYPE}`))).json();

    expect(body.sessions[0].lastQuestionIndex).toBeNull();
    expect(body.sessions[0].nextPosition).toBe(0);
  });

  // AC 2.
  it('returns 404 when no session is in progress for that activity type', async () => {
    queueValidActivityType();
    queue('session_log', { data: [], error: null });

    const response = await GET(req(`?activityType=${ACTIVITY_TYPE}`));

    expect(response.status).toBe(404);
    // Nothing further to look up once there is no session.
    expect(h.state.tables).toEqual(['activity_type', 'session_log']);
  });

  // AC 3: the filter is on the id from the token, so a foreign session is simply not returned
  // and looks exactly like a missing one.
  it("returns 404 for another student's session", async () => {
    queueValidActivityType();
    queue('session_log', { data: [], error: null });

    expect((await GET(req(`?activityType=${ACTIVITY_TYPE}`))).status).toBe(404);
  });

  it('returns every running session when no activity type is given', async () => {
    queue('session_log', {
      data: [
        sessionRow(),
        sessionRow({ session_id: 'session-2', activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA' }),
      ],
      error: null,
    });
    queue('session_to_question', {
      data: [
        ...drawnQuestions,
        { session_id: 'session-2', position: 0, question_id: 'q-9' },
      ],
      error: null,
    });
    queue('answered_question_log', {
      data: [{ session_id: 'session-1', question_id: 'q-1' }],
      error: null,
    });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0].questionIds).toEqual(['q-1', 'q-2', 'q-3', 'q-4']);
    expect(body.sessions[0].lastQuestionIndex).toBe(0);
    expect(body.sessions[1].questionIds).toEqual(['q-9']);
    expect(body.sessions[1].lastQuestionIndex).toBeNull();
  });

  // Nothing running at all is a normal state for an overview, not a missing record.
  it('returns an empty list rather than 404 without an activity type', async () => {
    queue('session_log', { data: [], error: null });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toEqual([]);
    expect(h.state.tables).toEqual(['session_log']);
  });

  it('returns 500 when the session lookup fails', async () => {
    queueValidActivityType();
    queue('session_log', { data: null, error: { message: 'boom' } });

    expect((await GET(req(`?activityType=${ACTIVITY_TYPE}`))).status).toBe(500);
  });

  it('never writes', async () => {
    queueValidActivityType();
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });
    queue('answered_question_log', { data: [], error: null });

    await GET(req(`?activityType=${ACTIVITY_TYPE}`));

    expect(h.state.inserts).toHaveLength(0);
  });
});
