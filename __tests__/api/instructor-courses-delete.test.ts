import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

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
      maybeSingle: async () => result,
      single: async () => result,
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

import { DELETE } from '../../app/api/instructor/courses/[id]/route';

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

/** Two enrolled students, in the shape loadEnrolledStudents selects them. */
function roster() {
  return [
    { user_id: 'student-1', student: { first_name: 'Ada', last_name: 'Lovelace', username: 'ada' } },
    { user_id: 'student-2', student: { first_name: null, last_name: null, username: 'grace' } },
  ];
}

function deleteRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses/course-1', {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const params = { params: { id: 'course-1' } };

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.deletes = [];
});

describe('DELETE /api/instructor/courses/[id]', () => {
  it('returns 401 without a token', async () => {
    const res = await DELETE(deleteRequest(null), params);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 404 when the course does not exist', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: null });

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(404);
    expect(h.state.deletes).toEqual([]);
  });

  it('returns 403 with an empty body when the caller does not own the course', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ creator_id: 'someone-else' }), error: null });

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.deletes).toEqual([]);
  });

  it('deletes the course and reports how many students were unenrolled', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null }); // findOwnedCourse
    queue('student_course', { data: roster(), error: null }); // count before the cascade
    queue('course', { data: null, error: null }); // the delete itself

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ courseId: 'course-1', unenrolledCount: 2 });

    // One statement only: student_course is never deleted from explicitly, because
    // fk_student_course_course cascades (see deleteCourse in lib/courseQueries.ts).
    expect(h.state.deletes).toEqual([{ table: 'course', column: 'course_id', value: 'course-1' }]);
  });

  it('deletes a course with nobody enrolled, reporting a count of 0', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: [], error: null });
    queue('course', { data: null, error: null });

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ courseId: 'course-1', unenrolledCount: 0 });
  });

  it('returns 500 and deletes nothing when the roster query fails', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: null, error: { message: 'Roster failure' } });

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Roster failure');
    // The count is what the confirmation was based on — a course must not be deleted when the
    // number of students it affects could not be established.
    expect(h.state.deletes).toEqual([]);
  });

  it('returns 500 when the delete fails', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: roster(), error: null });
    queue('course', { data: null, error: { message: 'DB failure' } });

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('DB failure');
  });
});
