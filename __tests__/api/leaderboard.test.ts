import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same harness shape as __tests__/api/courses-leaderboard.test.ts — computeGlobalLeaderboard has
// its own unit tests against a locally built fake client (__tests__/lib/leaderboardQueries.test.ts),
// so this harness only needs to get a request through the route, not re-verify the ranking logic.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
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
          ? { data: { user: { id: 'student-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/leaderboard/route';

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/leaderboard', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/leaderboard', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
  });

  it('returns 401 without a token, before touching any table', async () => {
    const response = await GET(req(null));
    expect(response.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('bad-token'));
    expect(response.status).toBe(401);
  });

  // The roster doesn't depend on the caller at all — every student account is ranked regardless
  // of who's asking, unlike GET /api/courses/{courseId}/leaderboard.
  it('returns 200 with an empty list when there are no student accounts at all', async () => {
    queue('user', { data: [], error: null });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toEqual([]);
  });

  it('returns every student account ranked, not just ones who share a course with the caller', async () => {
    queue('user', {
      data: [{ user_id: 'student-1', username: 'ada', avatar_url: null, selected_title: null }],
      error: null,
    });
    queue('session_log', {
      data: [
        {
          user_id: 'student-1',
          activity_type: 'SOME_CATALOG',
          difficulty_level: 1,
          cumulative_score: 100,
          ended_at: '2026-08-01T10:00:00.000Z',
          passed: true,
        },
      ],
      error: null,
    });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toEqual([{ rank: 1, studentId: 'student-1', username: 'ada', avatarUrl: null, title: null, points: 100, streak: 1 }]);
  });

  it('returns 500 when the roster query fails', async () => {
    queue('user', { data: null, error: { message: 'db down' } });

    const response = await GET(req());
    expect(response.status).toBe(500);
  });
});
