import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Harness copied from __tests__/api/score.test.ts, extended with `in` and `order` as no-ops so
// the same builder can also stand in for lib/leaderboardQueries.ts's roster/session_log queries
// (computeCourseLeaderboard itself has its own unit tests against a locally built fake client —
// see __tests__/lib/leaderboardQueries.test.ts — so this harness only needs to get requests
// through it, not re-verify the ranking logic).
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
      in: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => result,
      // PostgrestFilterBuilder is thenable — queries without .single()/.maybeSingle() resolve too.
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

import { GET } from '../../app/api/courses/[courseId]/leaderboard/route';

const COURSE_ID = 'course-1';

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/courses/${COURSE_ID}/leaderboard`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const ctx = { params: { courseId: COURSE_ID } };

describe('GET /api/courses/{courseId}/leaderboard', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
    h.state.filters = [];
  });

  it('returns 401 without a token, before touching any table', async () => {
    const response = await GET(req(null), ctx);
    expect(response.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('bad-token'), ctx);
    expect(response.status).toBe(401);
  });

  // AC: unknown courseId -> 404, checked before enrollment.
  it('returns 404 for an unknown course, without checking enrollment', async () => {
    queue('course', { data: null, error: null });

    const response = await GET(req(), ctx);

    expect(response.status).toBe(404);
    expect(h.state.tables).not.toContain('student_course');
  });

  // AC: the caller must themselves be enrolled — a leaderboard discloses other students' data.
  it('returns 403 when the caller is not enrolled in an existing course', async () => {
    queue('course', { data: { course_id: COURSE_ID }, error: null });
    queue('student_course', { data: [], error: null }); // membership check: no matching row

    const response = await GET(req(), ctx);

    expect(response.status).toBe(403);
    // The leaderboard query's own student_course roster read never runs.
    expect(h.state.tables.filter((t) => t === 'student_course')).toHaveLength(1);
  });

  // AC: an empty (or fully unattempted) course is 200 [], not 404 — the course itself is real.
  it('returns 200 with an empty list for a course with no enrolled students', async () => {
    queue('course', { data: { course_id: COURSE_ID }, error: null });
    queue('student_course', { data: [{ course_id: COURSE_ID }], error: null }); // membership check: caller is enrolled
    queue('student_course', { data: [], error: null }); // roster read inside computeCourseLeaderboard

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toEqual([]);
  });

  it('returns the ranked roster for an enrolled caller', async () => {
    queue('course', { data: { course_id: COURSE_ID }, error: null });
    queue('student_course', { data: [{ course_id: COURSE_ID }], error: null }); // membership check
    queue('student_course', {
      data: [{ user_id: 'student-1', student: { username: 'ada', avatar_url: null, role: 'student' } }],
      error: null,
    }); // roster
    queue('session_log', {
      data: [
        {
          user_id: 'student-1',
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          difficulty_level: 1,
          cumulative_score: 100,
          ended_at: '2026-08-01T10:00:00.000Z',
          passed: true,
        },
      ],
      error: null,
    });

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toEqual([{ rank: 1, studentId: 'student-1', username: 'ada', avatarUrl: null, points: 100, streak: 1 }]);
  });

  it('returns 500 when the course lookup fails', async () => {
    queue('course', { data: null, error: { message: 'db down' } });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });

  it('returns 500 when the membership check fails', async () => {
    queue('course', { data: { course_id: COURSE_ID }, error: null });
    queue('student_course', { data: null, error: { message: 'db down' } });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });

  it('returns 500 when the leaderboard query itself fails', async () => {
    queue('course', { data: { course_id: COURSE_ID }, error: null });
    queue('student_course', { data: [{ course_id: COURSE_ID }], error: null });
    queue('student_course', { data: null, error: { message: 'db down' } });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });
});
