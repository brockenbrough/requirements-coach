import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Harness copied from __tests__/api/courses-leaderboard.test.ts, extended with `delete` the same
// way __tests__/api/instructor-courses-unenroll.test.ts's builder is, since this route both
// checks membership (a select) and then deletes the enrollment.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    deletes: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    let isDelete = false;
    const builder: Record<string, unknown> = {
      select: () => builder,
      delete: () => {
        isDelete = true;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        if (isDelete) state.deletes.push({ table, column, value });
        return builder;
      },
      in: () => builder,
      limit: () => builder,
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

import { DELETE } from '../../app/api/courses/[courseId]/enrollment/route';

const COURSE_ID = 'course-1';

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/courses/${COURSE_ID}/enrollment`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const ctx = { params: { courseId: COURSE_ID } };

describe('DELETE /api/courses/{courseId}/enrollment', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
    h.state.deletes = [];
  });

  it('returns 401 without a token, before touching any table', async () => {
    const response = await DELETE(req(null), ctx);
    expect(response.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await DELETE(req('bad-token'), ctx);
    expect(response.status).toBe(401);
  });

  it('returns 404 for an unknown course, without checking enrollment', async () => {
    queue('course', { data: null, error: null });

    const response = await DELETE(req(), ctx);

    expect(response.status).toBe(404);
    expect(h.state.tables).not.toContain('student_course');
  });

  it('returns 404 when the caller is not enrolled in an existing course', async () => {
    queue('course', { data: { course_id: COURSE_ID }, error: null });
    queue('student_course', { data: [], error: null }); // membership check: no matching row

    const response = await DELETE(req(), ctx);

    expect(response.status).toBe(404);
    expect(h.state.deletes).toEqual([]);
  });

  it('removes the caller\'s own enrollment and returns the courseId', async () => {
    queue('course', { data: { course_id: COURSE_ID }, error: null });
    queue('student_course', { data: [{ course_id: COURSE_ID }], error: null }); // membership check
    queue('student_course', { data: null, error: null }); // delete

    const response = await DELETE(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ courseId: COURSE_ID });
    expect(h.state.deletes).toEqual([
      { table: 'student_course', column: 'course_id', value: COURSE_ID },
      { table: 'student_course', column: 'user_id', value: 'student-1' },
    ]);
  });

  it('returns 500 when the course lookup fails', async () => {
    queue('course', { data: null, error: { message: 'db down' } });

    const response = await DELETE(req(), ctx);
    expect(response.status).toBe(500);
  });

  it('returns 500 when the membership check fails', async () => {
    queue('course', { data: { course_id: COURSE_ID }, error: null });
    queue('student_course', { data: null, error: { message: 'db down' } });

    const response = await DELETE(req(), ctx);
    expect(response.status).toBe(500);
  });

  it('returns 500 when the delete fails', async () => {
    queue('course', { data: { course_id: COURSE_ID }, error: null });
    queue('student_course', { data: [{ course_id: COURSE_ID }], error: null });
    queue('student_course', { data: null, error: { message: 'DB failure' } });

    const response = await DELETE(req(), ctx);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('DB failure');
  });
});
