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
      order: () => builder,
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

import { GET } from '../../app/api/courses/mine/route';

function courseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    course_id: 'course-1',
    course_name: 'Software Requirements',
    created_at: '2026-08-11T10:00:00',
    semester: null,
    cover_image_url: null,
    creator: { first_name: 'Ada', last_name: 'Brockenbrough', username: 'abrock' },
    student_course: [{ count: 2 }],
    ...overrides,
  };
}

function getRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/courses/mine', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/courses/mine', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(getRequest(null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await GET(getRequest('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns an empty list without querying course when the student is in no courses', async () => {
    queue('student_course', { data: [], error: null });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courses).toEqual([]);
    expect(h.state.tables).not.toContain('course');
  });

  it('returns every enrolled course with alreadyMember always true', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('course', { data: [courseRow()], error: null });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.courses).toEqual([
      {
        id: 'course-1',
        name: 'Software Requirements',
        createdAt: '2026-08-11T10:00:00',
        professorName: 'Ada Brockenbrough',
        studentCount: 2,
        alreadyMember: true,
        semester: null,
        coverImageUrl: null,
      },
    ]);
  });

  it('scopes the course query to exactly the student\'s enrolled course ids', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }, { course_id: 'course-2' }], error: null });
    queue('course', { data: [courseRow(), courseRow({ course_id: 'course-2' })], error: null });

    await GET(getRequest());

    expect(h.state.filters).toContainEqual({ table: 'course', column: 'course_id', value: ['course-1', 'course-2'] });
  });

  it('includes a course with no join code, unlike GET /api/courses', async () => {
    // GitHub #427: this is the whole reason listEnrolledCoursesForStudent exists — the mock here
    // doesn't even have a course_code field, which is the point: this query never filters on it.
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('course', { data: [courseRow()], error: null });

    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.courses).toHaveLength(1);
  });

  it('passes through semester and coverImageUrl', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('course', {
      data: [courseRow({ semester: 'SoSe 2026', cover_image_url: 'https://example.com/course-covers/instructor-1/x.png' })],
      error: null,
    });

    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.courses[0].semester).toBe('SoSe 2026');
    expect(body.courses[0].coverImageUrl).toBe('https://example.com/course-covers/instructor-1/x.png');
  });

  it('falls back to the creator username when first/last name are blank', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('course', { data: [courseRow({ creator: { first_name: null, last_name: null, username: 'abrock' } })], error: null });

    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.courses[0].professorName).toBe('abrock');
  });

  it('returns 500 when the enrolled-course-ids lookup fails', async () => {
    queue('student_course', { data: null, error: { message: 'DB down' } });

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });

  it('returns 500 when the course query fails', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('course', { data: null, error: { message: 'DB down' } });

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
