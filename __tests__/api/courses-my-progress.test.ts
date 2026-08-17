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
      in: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
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

import { GET } from '../../app/api/courses/my-progress/route';

function getRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/courses/my-progress', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/courses/my-progress', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(getRequest(null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await GET(getRequest('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns an empty list without querying assembled_quiz/session_log when enrolled in nothing', async () => {
    queue('student_course', { data: [], error: null });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress).toEqual([]);
    expect(h.state.tables).toEqual(['student_course']);
  });

  it('returns each enrolled course\'s own passed-fraction, scoped to the calling student', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz', {
      data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_A' }, { activity_type: 'TYPE_B' }] }],
      error: null,
    });
    queue('session_log', { data: [{ activity_type: 'TYPE_A' }], error: null });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.progress).toEqual([
      { courseId: 'course-1', hasQuizzes: true, totalQuizzes: 2, passedQuizzes: 1, progressPercent: 50 },
    ]);
    expect(h.state.filters).toContainEqual({ table: 'session_log', column: 'user_id', value: 'student-1' });
  });

  it('returns 500 when the enrollment lookup fails', async () => {
    queue('student_course', { data: null, error: { message: 'DB down' } });

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });

  it('returns 500 when a per-course lookup fails', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz', { data: null, error: { message: 'DB down' } });

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
