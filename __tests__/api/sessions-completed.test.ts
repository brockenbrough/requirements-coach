import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    // eq() is recorded rather than ignored: the filters are the security boundary of this
    // route, so "did it scope to the token's user and to completed?" has to be assertable.
    filters: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      order: () => builder,
      maybeSingle: async () => result,
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

import { GET } from '../../app/api/sessions/completed/route';

const ACTIVITY = 'IDENTIFY_WEAK_USER_STORIES';

function req(query = `?activityType=${ACTIVITY}`, token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/sessions/completed${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

/** Queues a successful activity_type lookup (GitHub #347: isActivityType is now a DB read). */
function queueValidActivityType(activityType = ACTIVITY) {
  queue('activity_type', { data: { activity_type: activityType }, error: null });
}

/** A completed session row as the query selects it. */
function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 'session-1',
    difficulty_level: 1,
    cumulative_score: 75,
    max_score: 100,
    passed: false,
    ended_at: '2026-07-31T14:02:11.000Z',
    ...overrides,
  };
}

describe('GET /api/sessions/completed', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
    h.state.filters = [];
  });

  it('returns 401 without a token', async () => {
    const response = await GET(req(undefined, null));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    queueValidActivityType();
    const response = await GET(req(undefined, 'bad-token'));
    expect(response.status).toBe(401);
  });

  // activityType is required: without it this would duplicate GET /api/sessions?status=completed.
  it('returns 400 when activityType is missing', async () => {
    const response = await GET(req(''));

    expect(response.status).toBe(400);
    expect(h.state.tables).not.toContain('session_log');
  });

  it('returns 400 for an unknown activity type', async () => {
    const response = await GET(req('?activityType=NOT_AN_ACTIVITY'));

    expect(response.status).toBe(400);
    expect(h.state.tables).not.toContain('session_log');
  });

  // A history legitimately starts out empty — that is a normal state, not a 404.
  it('returns 200 and an empty list when there are no completed attempts', async () => {
    queueValidActivityType();
    queue('session_log', { data: [], error: null });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attempts).toEqual([]);
  });

  it('maps a session row onto the attempt shape', async () => {
    queueValidActivityType();
    queue('session_log', { data: [attemptRow()], error: null });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attempts).toEqual([
      {
        sessionId: 'session-1',
        difficultyLevel: 1,
        score: 75,
        maxScore: 100,
        passed: false,
        completedAt: '2026-07-31T14:02:11.000Z',
      },
    ]);
  });

  // The response is deliberately trimmed — the filter columns are not part of the payload.
  it('does not leak the underlying session columns', async () => {
    queueValidActivityType();
    queue('session_log', { data: [attemptRow()], error: null });

    const body = await (await GET(req())).json();

    expect(body.attempts[0]).not.toHaveProperty('user_id');
    expect(body.attempts[0]).not.toHaveProperty('activity_type');
    expect(body.attempts[0]).not.toHaveProperty('status');
    expect(JSON.stringify(body)).not.toContain('cumulative_score');
  });

  it('returns every attempt in query order, passed and failed alike', async () => {
    queueValidActivityType();
    queue('session_log', {
      data: [
        attemptRow({ session_id: 'session-3', cumulative_score: 100, passed: true, ended_at: '2026-07-30T09:00:00.000Z' }),
        attemptRow({ session_id: 'session-2', difficulty_level: 2, cumulative_score: 50, ended_at: '2026-07-29T09:00:00.000Z' }),
        attemptRow({ session_id: 'session-1', ended_at: '2026-07-28T09:00:00.000Z' }),
      ],
      error: null,
    });

    const body = await (await GET(req())).json();

    expect(body.attempts.map((a: { sessionId: string }) => a.sessionId)).toEqual([
      'session-3',
      'session-2',
      'session-1',
    ]);
    expect(body.attempts.map((a: { passed: boolean }) => a.passed)).toEqual([true, false, false]);
    expect(body.attempts[1].difficultyLevel).toBe(2);
  });

  // The student id comes from the token, so a foreign history cannot be requested at all.
  it('scopes the query to the authenticated user, the activity type and completed status', async () => {
    queueValidActivityType();
    queue('session_log', { data: [], error: null });

    await GET(req());

    expect(h.state.filters).toEqual([
      // The activity_type lookup (isActivityType) runs before session_log is ever queried.
      { table: 'activity_type', column: 'activity_type', value: ACTIVITY },
      { table: 'session_log', column: 'user_id', value: 'user-123' },
      { table: 'session_log', column: 'activity_type', value: ACTIVITY },
      { table: 'session_log', column: 'status', value: 'completed' },
    ]);
  });

  // GitHub #583: an assembledQuizId query param scopes history to one quiz, so two quizzes
  // sharing a catalog don't show each other's completed attempts.
  it('additionally filters by assembled_quiz_id when the query param is present', async () => {
    queueValidActivityType();
    queue('session_log', { data: [], error: null });

    await GET(req(`?activityType=${ACTIVITY}&assembledQuizId=quiz-1`));

    expect(h.state.filters).toContainEqual({ table: 'session_log', column: 'assembled_quiz_id', value: 'quiz-1' });
  });

  it('does not filter by assembled_quiz_id when the query param is absent', async () => {
    queueValidActivityType();
    queue('session_log', { data: [], error: null });

    await GET(req());

    expect(h.state.filters.some((f) => f.column === 'assembled_quiz_id')).toBe(false);
  });

  it('returns 500 when the session_log query fails', async () => {
    queueValidActivityType();
    queue('session_log', { data: null, error: { message: 'db down' } });

    const response = await GET(req());

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('db down');
  });
});
