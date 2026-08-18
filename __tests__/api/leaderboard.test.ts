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

  // No courseId anywhere in this route — the caller's own enrolled courses (derived from their
  // token) decide the roster, unlike GET /api/courses/{courseId}/leaderboard.
  it('returns 200 with an empty list for a caller enrolled in nothing', async () => {
    queue('student_course', { data: [], error: null }); // getEnrolledCourseIds

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toEqual([]);
  });

  it('returns the ranked, cross-course roster for an enrolled caller', async () => {
    queue('student_course', { data: [{ course_id: 'course-a' }], error: null }); // getEnrolledCourseIds
    queue('student_course', {
      data: [{ user_id: 'student-1', student: { username: 'ada', avatar_url: null, role: 'student' } }],
      error: null,
    }); // roster
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
    expect(body.entries).toEqual([{ rank: 1, studentId: 'student-1', username: 'ada', avatarUrl: null, points: 100, streak: 1 }]);
  });

  it('returns 500 when the enrolled-courses lookup fails', async () => {
    queue('student_course', { data: null, error: { message: 'db down' } });

    const response = await GET(req());
    expect(response.status).toBe(500);
  });
});
