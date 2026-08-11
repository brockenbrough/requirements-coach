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
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      eq: () => builder,
      order: () => builder,
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

import { GET, POST } from '../../app/api/instructor/courses/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function postRequest(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function courseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    course_id: 'course-1',
    course_name: 'Software Requirements',
    course_code: 'ABCDEF',
    created_at: '2026-08-11T10:00:00',
    ...overrides,
  };
}

function getRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

/** A course row as GET's embedded student_course(count) select actually returns it. */
function courseWithCountRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    course_id: 'course-1',
    course_name: 'Software Requirements',
    course_code: 'ABCDEF',
    created_at: '2026-08-11T10:00:00',
    student_course: [{ count: 3 }],
    ...overrides,
  };
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
});

describe('POST /api/instructor/courses', () => {
  it('returns 401 without a token', async () => {
    const res = await POST(postRequest({ name: 'Course' }, null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await POST(postRequest({ name: 'Course' }, 'bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await POST(postRequest({ name: 'Course' }));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 400 for an invalid JSON body', async () => {
    queueRole('instructor');
    const res = await POST(
      new Request('http://localhost/api/instructor/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for a missing name', async () => {
    queueRole('instructor');
    const res = await POST(postRequest({}));
    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 400 for a blank name', async () => {
    queueRole('instructor');
    const res = await POST(postRequest({ name: '   ' }));
    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 201 with the created course on success', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });

    const res = await POST(postRequest({ name: 'Software Requirements' }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.course).toEqual({
      id: 'course-1',
      name: 'Software Requirements',
      code: 'ABCDEF',
      createdAt: '2026-08-11T10:00:00',
    });
  });

  it('inserts with creator_id from the token and a 6-character generated code', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });

    await POST(postRequest({ name: 'Software Requirements' }));

    const insert = h.state.inserts.find((i) => i.table === 'course');
    expect(insert?.payload).toMatchObject({
      creator_id: 'instructor-1',
      course_name: 'Software Requirements',
    });
    const payload = insert?.payload as { course_code: string };
    expect(payload.course_code).toHaveLength(6);
  });

  it('retries with a fresh code on a uq_course_code collision, then succeeds', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: { code: '23505', message: 'duplicate key' } });
    queue('course', { data: courseRow(), error: null });

    const res = await POST(postRequest({ name: 'Software Requirements' }));
    expect(res.status).toBe(201);
    expect(h.state.inserts.filter((i) => i.table === 'course')).toHaveLength(2);
  });

  it('returns 500 after exhausting every attempt on repeated collisions', async () => {
    queueRole('instructor');
    for (let i = 0; i < 5; i++) {
      queue('course', { data: null, error: { code: '23505', message: 'duplicate key' } });
    }

    const res = await POST(postRequest({ name: 'Software Requirements' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('5 attempts');
    expect(h.state.inserts.filter((i) => i.table === 'course')).toHaveLength(5);
  });

  it('returns 500 immediately on a non-collision insert error, without retrying', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: { message: 'DB failure' } });

    const res = await POST(postRequest({ name: 'Software Requirements' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB failure');
    expect(h.state.inserts.filter((i) => i.table === 'course')).toHaveLength(1);
  });
});

describe('GET /api/instructor/courses', () => {
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

  it('returns 200 with an empty list when the instructor has no courses', async () => {
    queueRole('instructor');
    queue('course', { data: [], error: null });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courses).toEqual([]);
  });

  it('returns 200 with courses mapped from the embedded student_course(count) shape', async () => {
    queueRole('instructor');
    queue('course', { data: [courseWithCountRow(), courseWithCountRow({ course_id: 'course-2', student_course: [{ count: 0 }] })], error: null });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.courses).toEqual([
      { id: 'course-1', name: 'Software Requirements', code: 'ABCDEF', createdAt: '2026-08-11T10:00:00', studentCount: 3 },
      { id: 'course-2', name: 'Software Requirements', code: 'ABCDEF', createdAt: '2026-08-11T10:00:00', studentCount: 0 },
    ]);
  });

  it('returns 500 when the query fails', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: { message: 'DB down' } });

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
