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

import { GET } from '../../app/api/instructor/courses/class-stats/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function getRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses/class-stats', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
});

describe('GET /api/instructor/courses/class-stats', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(getRequest(null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('course');
  });

  it('returns stats for every course the instructor owns', async () => {
    queueRole('instructor');
    queue('course', { data: [{ course_id: 'course-1', course_name: 'Course One' }], error: null });
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_A' }] }], error: null });
    queue('student_course', { data: [{ user_id: 'student-1' }], error: null });
    queue('session_log', { data: [{ user_id: 'student-1', passed: false }], error: null });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      stats: [
        {
          courseId: 'course-1',
          courseName: 'Course One',
          totalStudents: 1,
          hasQuizzes: true,
          startedCount: 1,
          startedPercent: 100,
          passedCount: 0,
          passedPercent: 0,
        },
      ],
    });
  });

  it('returns an empty list when the instructor owns no courses', async () => {
    queueRole('instructor');
    queue('course', { data: [], error: null });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ stats: [] });
  });
});
