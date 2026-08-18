import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

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
      maybeSingle: async () => result,
      single: async () => result,
      then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(result).then(onOk, onErr),
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

import { GET } from '../../app/api/instructor/courses/[id]/engagement/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function courseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    course_id: 'course-1',
    course_name: 'Software Requirements',
    course_code: 'ABCDEF',
    creator_id: 'instructor-1',
    created_at: '2026-08-11T10:00:00',
    ...overrides,
  };
}

function getRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses/course-1/engagement', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const params = { params: { id: 'course-1' } };

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
});

describe('GET /api/instructor/courses/[id]/engagement', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(getRequest(null), params);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await GET(getRequest(), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 404 when the course does not exist', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(404);
  });

  it('returns 403 with an empty body when the caller does not own the course', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ creator_id: 'someone-else' }), error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns class engagement stats for an owned course', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_A' }] }], error: null });
    queue('student_course', { data: [{ user_id: 'student-1' }, { user_id: 'student-2' }], error: null });
    queue('session_log', { data: [{ user_id: 'student-1', passed: true }], error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      courseId: 'course-1',
      courseName: 'Software Requirements',
      totalStudents: 2,
      hasQuizzes: true,
      startedCount: 1,
      startedPercent: 50,
      passedCount: 1,
      passedPercent: 50,
    });
  });
});
