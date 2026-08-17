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
      not: () => builder,
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

import { GET } from '../../app/api/courses/route';

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
  return new Request('http://localhost/api/courses', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
});

describe('GET /api/courses', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(getRequest(null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await GET(getRequest('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns 200 with an empty list when no courses have a code', async () => {
    queue('course', { data: [], error: null });
    queue('student_course', { data: [], error: null });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courses).toEqual([]);
  });

  it('maps studentCount from the embedded student_course(count) and professorName from the creator embed', async () => {
    queue('course', { data: [courseRow()], error: null });
    queue('student_course', { data: [], error: null });

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
        alreadyMember: false,
        semester: null,
        coverImageUrl: null,
      },
    ]);
  });

  it('passes through semester and coverImageUrl from the course row', async () => {
    queue('course', {
      data: [courseRow({ semester: 'SoSe 2026', cover_image_url: 'https://example.com/course-covers/instructor-1/x.png' })],
      error: null,
    });
    queue('student_course', { data: [], error: null });

    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.courses[0].semester).toBe('SoSe 2026');
    expect(body.courses[0].coverImageUrl).toBe('https://example.com/course-covers/instructor-1/x.png');
  });

  it('never includes the course code — a secret the instructor hands out directly, not this route', async () => {
    queue('course', { data: [courseRow()], error: null });
    queue('student_course', { data: [], error: null });

    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.courses[0]).not.toHaveProperty('code');
  });

  it('falls back to the creator username when first/last name are blank', async () => {
    queue('course', {
      data: [courseRow({ creator: { first_name: null, last_name: null, username: 'abrock' } })],
      error: null,
    });
    queue('student_course', { data: [], error: null });

    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.courses[0].professorName).toBe('abrock');
  });

  it('sets alreadyMember true only for courses the caller has joined, scoped to their own membership rows', async () => {
    queue('course', {
      data: [courseRow(), courseRow({ course_id: 'course-2' })],
      error: null,
    });
    // The caller (student-1, per the auth mock) is only in course-1.
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });

    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.courses.find((c: { id: string }) => c.id === 'course-1').alreadyMember).toBe(true);
    expect(body.courses.find((c: { id: string }) => c.id === 'course-2').alreadyMember).toBe(false);
  });

  it('returns 500 when the course query fails', async () => {
    queue('course', { data: null, error: { message: 'DB down' } });

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
    // The membership query never runs once the course query has already failed.
    expect(h.state.tables.filter((t) => t === 'student_course')).toHaveLength(0);
  });

  it('returns 500 when the membership query fails', async () => {
    queue('course', { data: [courseRow()], error: null });
    queue('student_course', { data: null, error: { message: 'DB down' } });

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
