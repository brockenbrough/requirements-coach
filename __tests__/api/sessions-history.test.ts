import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { column: string; value: unknown }[],
    orders: [] as { column: string; ascending: boolean }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ column, value });
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        state.orders.push({ column, ascending: opts?.ascending ?? true });
        return builder;
      },
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
      const queued = h.state.queues[table]?.shift() ?? { data: [], error: null };
      return h.makeBuilder(table, queued);
    },
  }),
}));

import { GET } from '../../app/api/sessions/history/route';

function makeRequest(token = 'valid-token') {
  return new Request('http://localhost/api/sessions/history', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
  h.state.orders = [];
});

describe('GET /api/sessions/history', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(new Request('http://localhost/api/sessions/history'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await GET(makeRequest('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns an empty array when no completed sessions exist', async () => {
    queue('session_log', { data: [], error: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });

  it('returns completed sessions with the correct fields', async () => {
    const mockSessions = [
      { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 100, max_score: 100, passed: true, ended_at: '2026-08-03T10:00:00Z' },
      { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficulty_level: 2, cumulative_score: 75, max_score: 100, passed: false, ended_at: '2026-08-02T10:00:00Z' },
    ];
    queue('session_log', { data: mockSessions, error: null });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0]).toMatchObject({
      activity_type: 'IDENTIFY_WEAK_USER_STORIES',
      difficulty_level: 1,
      cumulative_score: 100,
      max_score: 100,
      passed: true,
    });
  });

  it('only returns completed sessions', async () => {
    queue('session_log', { data: [], error: null });
    await GET(makeRequest());
    expect(h.state.filters).toContainEqual({ column: 'status', value: 'completed' });
  });

  it('only returns sessions belonging to the requesting student', async () => {
    queue('session_log', { data: [], error: null });
    await GET(makeRequest());
    expect(h.state.filters).toContainEqual({ column: 'user_id', value: 'user-123' });
  });

  it('orders sessions by completion date descending', async () => {
    queue('session_log', { data: [], error: null });
    await GET(makeRequest());
    expect(h.state.orders).toContainEqual({ column: 'ended_at', ascending: false });
  });

  it('returns 500 when the database returns an error', async () => {
    queue('session_log', { data: null, error: { message: 'DB error' } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});
