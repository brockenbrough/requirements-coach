import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    filters: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
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
          ? { data: { user: { id: 'instructor-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/instructor/students/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function makeRequest(token?: string) {
  return new Request('http://localhost/api/instructor/students', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/instructor/students', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.filters = [];
  });

  it('returns 401 when no token is provided', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is invalid', async () => {
    const res = await GET(makeRequest('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is a student', async () => {
    queueRole('student');
    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 200 with the student list', async () => {
    queueRole('instructor');
    queue('user', {
      data: [
        { user_id: 'u1', username: 'alice', first_name: 'Alice', last_name: 'Smith' },
        { user_id: 'u2', username: 'bob', first_name: 'Bob', last_name: 'Jones' },
      ],
      error: null,
    });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.students).toHaveLength(2);
    expect(body.students[0]).toEqual({
      userId: 'u1',
      username: 'alice',
      firstName: 'Alice',
      lastName: 'Smith',
    });
    expect(body.students[1]).toEqual({
      userId: 'u2',
      username: 'bob',
      firstName: 'Bob',
      lastName: 'Jones',
    });
  });

  it('returns 200 with empty list when no students exist', async () => {
    queueRole('instructor');
    queue('user', { data: [], error: null });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.students).toEqual([]);
  });

  it('filters the user table by role = student', async () => {
    queueRole('instructor');
    queue('user', { data: [], error: null });

    await GET(makeRequest('valid-token'));

    const studentFilter = h.state.filters.find(
      (f) => f.table === 'user' && f.column === 'role' && f.value === 'student',
    );
    expect(studentFilter).toBeDefined();
  });

  it('returns 500 when the database returns an error', async () => {
    queueRole('instructor');
    queue('user', { data: null, error: { message: 'DB failure' } });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB failure');
  });
});
