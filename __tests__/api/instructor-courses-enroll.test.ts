import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
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

import { POST } from '../../app/api/instructor/courses/[id]/students/route';

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

function studentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return { user_id: 'student-1', first_name: 'Alex', last_name: 'Chen', username: 'achen', ...overrides };
}

function postRequest(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses/course-1/students', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const params = { params: { id: 'course-1' } };

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
});

describe('POST /api/instructor/courses/[id]/students', () => {
  it('returns 401 without a token', async () => {
    const res = await POST(postRequest({ studentId: 'student-1' }, null), params);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await POST(postRequest({ studentId: 'student-1' }), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 404 when the course does not exist', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: null });

    const res = await POST(postRequest({ studentId: 'student-1' }), params);
    expect(res.status).toBe(404);
  });

  it('returns 403 with an empty body when the caller does not own the course', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ creator_id: 'someone-else' }), error: null });

    const res = await POST(postRequest({ studentId: 'student-1' }), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 400 for a missing studentId', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });

    const res = await POST(postRequest({}), params);
    expect(res.status).toBe(400);
    // 'user' is hit once already, by requireInstructor's own role check — this asserts no
    // *second* lookup (the student-exists check) ever fires for an invalid body.
    expect(h.state.tables.filter((t) => t === 'user')).toHaveLength(1);
  });

  it('returns 404 when the student does not exist', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('user', { data: null, error: null });

    const res = await POST(postRequest({ studentId: 'nope' }), params);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Student not found.');
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 409 when the student is already enrolled', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('user', { data: studentRow(), error: null });
    queue('student_course', { data: null, error: { code: '23505', message: 'duplicate key' } });

    const res = await POST(postRequest({ studentId: 'student-1' }), params);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('This student is already enrolled in this course.');
  });

  it('returns 201 with the new student row on success', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('user', { data: studentRow(), error: null });
    queue('student_course', { data: null, error: null });

    const res = await POST(postRequest({ studentId: 'student-1' }), params);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.student).toEqual({
      id: 'student-1',
      name: 'Alex Chen',
      attempts: 0,
      averageScore: null,
      abandonedCount: 0,
      needsAttention: false,
    });

    const insert = h.state.inserts.find((i) => i.table === 'student_course');
    expect(insert?.payload).toEqual({ user_id: 'student-1', course_id: 'course-1' });
  });

  it('falls back to username when first/last name are blank', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('user', { data: studentRow({ first_name: null, last_name: null, username: 'achen' }), error: null });
    queue('student_course', { data: null, error: null });

    const res = await POST(postRequest({ studentId: 'student-1' }), params);
    const body = await res.json();
    expect(body.student.name).toBe('achen');
  });
});
