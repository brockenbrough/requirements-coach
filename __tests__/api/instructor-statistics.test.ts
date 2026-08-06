import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
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
          ? { data: { user: { id: 'instructor-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/instructor/statistics/route';

/** requireInstructor's own lookup: the caller's role, read from "user" first. */
function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function queueActivityTypes(rows: { activity_type: string }[]) {
  queue('activity_type', { data: rows, error: null });
}

function completedSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    cumulative_score: 100,
    max_score: 100,
    passed: true,
    ...overrides,
  };
}

function request(token?: string) {
  return new Request('http://localhost/api/instructor/statistics', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/instructor/statistics', () => {
  it('answers 401 without a token', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(h.state.tables).toEqual([]);
  });

  it('answers 401 for an invalid token', async () => {
    const response = await GET(request('bad-token'));
    expect(response.status).toBe(401);
  });

  it('rejects a student with 403 and an empty body, before reading any data', async () => {
    queueRole('student');

    const response = await GET(request('valid-token'));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(h.state.tables).not.toContain('activity_type');
    expect(h.state.tables).not.toContain('session_log');
  });

  it('rejects an account without a profile row, which has never been confirmed as an instructor', async () => {
    queue('user', { data: null, error: null });

    const response = await GET(request('valid-token'));

    expect(response.status).toBe(403);
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('returns 404 when there are no quizzes at all', async () => {
    queueRole('instructor');
    queueActivityTypes([]);

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/no quizzes/i);
  });

  it('computes class average as the mean of each attempt\'s own percentage, and pass rate as the passed share', async () => {
    queueRole('instructor');
    queueActivityTypes([{ activity_type: 'IDENTIFY_WEAK_USER_STORIES' }]);
    queue('session_log', {
      data: [
        completedSession({ cumulative_score: 100, max_score: 100, passed: true }),
        completedSession({ cumulative_score: 50, max_score: 100, passed: false }),
        completedSession({ cumulative_score: 75, max_score: 100, passed: false }),
      ],
      error: null,
    });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.statistics).toEqual([
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', classAverage: 75, passRate: 33 },
    ]);
  });

  it('reports 0%/0% for a quiz with no completed attempts, rather than omitting it or dividing by zero', async () => {
    queueRole('instructor');
    queueActivityTypes([
      { activity_type: 'IDENTIFY_WEAK_USER_STORIES' },
      { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA' },
    ]);
    queue('session_log', {
      data: [completedSession({ activity_type: 'IDENTIFY_WEAK_USER_STORIES' })],
      error: null,
    });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.statistics).toContainEqual({
      activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
      classAverage: 0,
      passRate: 0,
    });
  });

  it('only counts completed sessions', async () => {
    queueRole('instructor');
    queueActivityTypes([{ activity_type: 'IDENTIFY_WEAK_USER_STORIES' }]);
    queue('session_log', { data: [], error: null });

    await GET(request('valid-token'));

    expect(h.state.filters).toContainEqual({ table: 'session_log', column: 'status', value: 'completed' });
  });

  it('returns 500 when the activity_type query fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: { message: 'boom' } });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
  });

  it('returns 500 when the session_log query fails', async () => {
    queueRole('instructor');
    queueActivityTypes([{ activity_type: 'IDENTIFY_WEAK_USER_STORIES' }]);
    queue('session_log', { data: null, error: { message: 'boom' } });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
  });
});
