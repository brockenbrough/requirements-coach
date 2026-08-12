import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same harness as __tests__/api/score.test.ts — copy the shape rather than inventing a new one.
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
      order: () => builder,
      // PostgrestFilterBuilder is thenable — queries without .single() are awaited directly.
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

import { GET } from '../../app/api/students/[studentId]/streak/route';

const STUDENT_ID = 'user-123';

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/students/${STUDENT_ID}/streak`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const ctx = { params: { studentId: STUDENT_ID } };

describe('GET /api/students/{studentId}/streak', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
    h.state.filters = [];
  });

  it('returns 401 without a token', async () => {
    const response = await GET(req(null), ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('bad-token'), ctx);
    expect(response.status).toBe(401);
  });

  // studentId must match the authenticated user — no instructor exception on this route.
  it("returns 403 for a studentId that is not the requesting student's", async () => {
    const response = await GET(req(), { params: { studentId: 'someone-else' } });

    expect(response.status).toBe(403);
    expect(h.state.tables).not.toContain('session_log');
  });

  it('returns a streak of 0 when the student has no passed sessions', async () => {
    queue('session_log', { data: [], error: null });

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentStreak).toBe(0);
  });

  it('returns the computed streak for a student with passed sessions', async () => {
    queue('session_log', {
      data: [{ ended_at: '2026-08-10T09:00:00' }, { ended_at: '2026-08-11T09:00:00' }],
      error: null,
    });

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentStreak).toBe(2);
  });

  it('returns 500 when the session_log query fails', async () => {
    queue('session_log', { data: null, error: { message: 'db down' } });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });
});
