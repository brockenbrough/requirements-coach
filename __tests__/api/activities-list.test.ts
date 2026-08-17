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
      maybeSingle: async () => result,
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

import { GET } from '../../app/api/activities/route';

function req(token: string | null = 'valid-token', courseId?: string) {
  const url = courseId ? `http://localhost/api/activities?courseId=${courseId}` : 'http://localhost/api/activities';
  return new Request(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/activities', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await GET(req('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns an empty list without querying assembled_quiz_catalog when the caller is in no courses', async () => {
    queue('student_course', { data: [], error: null });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activities).toEqual([]);
    expect(h.state.tables).not.toContain('assembled_quiz_catalog');
  });

  it('returns every activity reachable through an assembled quiz in any of the caller\'s enrolled courses', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }, { course_id: 'course-2' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          catalog: { quiz_name: 'Identify Weak User Stories', description: null, grading_kind: 'mcq' },
          assembled_quiz: {
            course_id: 'course-1',
            quiz_name: 'Weak Stories — Sprint 2',
            description: 'Sprint 2 edition',
            course: { course_name: 'Software Requirements' },
          },
        },
        {
          activity_type: 'MY_CUSTOM_QUIZ',
          catalog: { quiz_name: 'My Custom Quiz', description: 'A quiz about things', grading_kind: 'llm-graded' },
          assembled_quiz: {
            course_id: 'course-2',
            quiz_name: 'Advanced Practice Set',
            description: 'For the advanced section',
            course: { course_name: 'Advanced SE' },
          },
        },
      ],
      error: null,
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.activities).toEqual([
      {
        activityType: 'IDENTIFY_WEAK_USER_STORIES',
        name: 'Weak Stories — Sprint 2',
        description: 'Sprint 2 edition',
        gradingKind: 'mcq',
        courseId: 'course-1',
        courseName: 'Software Requirements',
      },
      {
        activityType: 'MY_CUSTOM_QUIZ',
        name: 'Advanced Practice Set',
        description: 'For the advanced section',
        gradingKind: 'llm-graded',
        courseId: 'course-2',
        courseName: 'Advanced SE',
      },
    ]);

    expect(h.state.filters).toContainEqual({
      table: 'assembled_quiz_catalog',
      column: 'assembled_quiz.course_id',
      value: ['course-1', 'course-2'],
    });
  });

  it('scopes to a single course when ?courseId= is given and the caller is enrolled in it', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }, { course_id: 'course-2' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          catalog: { quiz_name: 'Identify Weak User Stories', description: null, grading_kind: 'mcq' },
          assembled_quiz: {
            course_id: 'course-1',
            quiz_name: 'Weak Stories — Sprint 2',
            description: 'Sprint 2 edition',
            course: { course_name: 'Software Requirements' },
          },
        },
      ],
      error: null,
    });

    const res = await GET(req('valid-token', 'course-1'));
    expect(res.status).toBe(200);

    expect(h.state.filters).toContainEqual({
      table: 'assembled_quiz_catalog',
      column: 'assembled_quiz.course_id',
      value: ['course-1'],
    });
  });

  it('returns 403 with an empty body when ?courseId= is a course the caller is not enrolled in', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });

    const res = await GET(req('valid-token', 'course-999'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('assembled_quiz_catalog');
  });

  it('returns 500 when the enrolled-course lookup fails', async () => {
    queue('student_course', { data: null, error: { message: 'DB down' } });

    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it('returns 500 when the activity lookup fails', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', { data: null, error: { message: 'DB down' } });

    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
