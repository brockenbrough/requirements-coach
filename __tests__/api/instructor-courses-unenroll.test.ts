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

import { DELETE } from '../../app/api/instructor/courses/[id]/students/[studentId]/route';

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

function deleteRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses/course-1/students/student-1', {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const params = { params: { id: 'course-1', studentId: 'student-1' } };

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.deletes = [];
});

describe('DELETE /api/instructor/courses/[id]/students/[studentId]', () => {
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
  });

  it('returns 403 with an empty body when the caller does not own the course', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ creator_id: 'someone-else' }), error: null });

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('removes the enrollment and returns the studentId', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: null, error: null });

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ studentId: 'student-1' });
    expect(h.state.deletes).toEqual([
      { table: 'student_course', column: 'course_id', value: 'course-1' },
      { table: 'student_course', column: 'user_id', value: 'student-1' },
    ]);
  });

  it('is idempotent — succeeds even when the student was never enrolled', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: null, error: null });

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(200);
  });

  it('returns 500 when the delete fails', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: null, error: { message: 'DB failure' } });

    const res = await DELETE(deleteRequest(), params);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB failure');
  });
});
