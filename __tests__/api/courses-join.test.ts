import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    tables: [] as string[],
    // Recorded rather than ignored: the normalization test needs to assert the actual value
    // Postgres was queried with, not just that `course` was queried.
    eqCalls: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.eqCalls.push({ table, column, value });
        return builder;
      },
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      maybeSingle: async () => result,
      single: async () => result,
      // PostgrestFilterBuilder is thenable — queries without .single() are awaited directly.
      then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onOk, onErr),
    };
    return builder;
  }

  return { state, makeBuilder };
});

/** Queues the result the next `from(table)` chain resolves to. */
function queue(table: string, result: Result) {
  (h.state.queues[table] ??= []).push(result);
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-123' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { POST } from '../../app/api/courses/join/route';

function courseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    course_id: 'course-1',
    course_name: 'Software Requirements',
    course_code: 'ABCDEF',
    created_at: '2026-08-11T10:00:00',
    ...overrides,
  };
}

function postRequest(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/courses/join', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.inserts = [];
  h.state.tables = [];
  h.state.eqCalls = [];
});

describe('POST /api/courses/join', () => {
  it('returns 401 without a token', async () => {
    const res = await POST(postRequest({ code: 'ABCDEF' }, null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await POST(postRequest({ code: 'ABCDEF' }, 'bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/courses/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when code is missing', async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 400 when code is blank', async () => {
    const res = await POST(postRequest({ code: '   ' }));
    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 404 for an unknown code', async () => {
    queue('course', { data: null, error: null });

    const res = await POST(postRequest({ code: 'NOPE99' }));
    expect(res.status).toBe(404);
    expect(h.state.inserts.some((i) => i.table === 'student_course')).toBe(false);
  });

  it('returns 500 when the course lookup itself errors', async () => {
    queue('course', { data: null, error: { message: 'DB down' } });

    const res = await POST(postRequest({ code: 'ABCDEF' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });

  it('normalizes casing and whitespace before querying', async () => {
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: null, error: null });

    await POST(postRequest({ code: '  abcdef  ' }));

    expect(h.state.eqCalls).toContainEqual({ table: 'course', column: 'course_code', value: 'ABCDEF' });
  });

  it('returns 201 with alreadyMember: false on first join', async () => {
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: null, error: null });

    const res = await POST(postRequest({ code: 'ABCDEF' }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body).toEqual({
      course: { id: 'course-1', name: 'Software Requirements', code: 'ABCDEF', createdAt: '2026-08-11T10:00:00' },
      alreadyMember: false,
    });

    const insert = h.state.inserts.find((i) => i.table === 'student_course');
    expect(insert?.payload).toEqual({ user_id: 'user-123', course_id: 'course-1' });
  });

  it('returns 200 with alreadyMember: true when already enrolled, without a re-query', async () => {
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: null, error: { code: '23505', message: 'duplicate key' } });

    const res = await POST(postRequest({ code: 'ABCDEF' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.alreadyMember).toBe(true);
    expect(body.course).toEqual({ id: 'course-1', name: 'Software Requirements', code: 'ABCDEF', createdAt: '2026-08-11T10:00:00' });
    expect(h.state.inserts.filter((i) => i.table === 'student_course')).toHaveLength(1);
  });

  it('returns 409 when the student has no profile row yet', async () => {
    queue('course', { data: courseRow(), error: null });
    queue('student_course', {
      data: null,
      error: { code: '23503', message: 'insert or update on table "student_course" violates foreign key constraint "fk_student_course_user"' },
    });

    const res = await POST(postRequest({ code: 'ABCDEF' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/profile/i);
  });

  it('returns 500, not 409, for an unrelated foreign key violation', async () => {
    queue('course', { data: courseRow(), error: null });
    queue('student_course', {
      data: null,
      error: { code: '23503', message: 'insert or update on table "student_course" violates foreign key constraint "fk_student_course_course"' },
    });

    const res = await POST(postRequest({ code: 'ABCDEF' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/fk_student_course_course/);
  });

  it('returns 500 on a generic insert error', async () => {
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: null, error: { message: 'DB failure' } });

    const res = await POST(postRequest({ code: 'ABCDEF' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB failure');
  });

  it('ignores a spoofed user_id/studentId in the body', async () => {
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: null, error: null });

    await POST(postRequest({ code: 'ABCDEF', user_id: 'attacker-999', studentId: 'attacker-999' }));

    const insert = h.state.inserts.find((i) => i.table === 'student_course');
    expect(insert?.payload).toEqual({ user_id: 'user-123', course_id: 'course-1' });
  });
});
