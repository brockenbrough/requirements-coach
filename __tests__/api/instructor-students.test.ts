import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely. tables/filters (eq and in, the
// latter suffixed " (in)" to disambiguate from an eq() on the same column) are recorded rather
// than no-ops — same reasoning as __tests__/api/instructor-activities.test.ts: "only students
// enrolled in a course this instructor owns" is an acceptance criterion of this endpoint's default
// scope, and an ignored/short-circuited filter would let a regression back in unnoticed.
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
        state.filters.push({ table, column: `${column} (in)`, value });
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
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/instructor/students/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

/** Queues a successful "owns these courses" result. */
function queueOwnedCourseIds(courseIds: string[]) {
  queue('course', { data: courseIds.map((course_id) => ({ course_id })), error: null });
}

/** Queues a successful "these students are enrolled in the given courses" result. */
function queueEnrolledStudentIds(userIds: string[]) {
  queue('student_course', { data: userIds.map((user_id) => ({ user_id })), error: null });
}

function makeRequest(token?: string, query = '') {
  return new Request(`http://localhost/api/instructor/students${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/instructor/students', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
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

  it('returns 200 with only students enrolled in a course this instructor owns', async () => {
    queueRole('instructor');
    queueOwnedCourseIds(['course-1']);
    queueEnrolledStudentIds(['u1', 'u2']);
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
    expect(h.state.filters).toContainEqual({ table: 'course', column: 'creator_id', value: 'instructor-1' });
    expect(h.state.filters).toContainEqual({ table: 'student_course', column: 'course_id (in)', value: ['course-1'] });
    expect(h.state.filters).toContainEqual({ table: 'user', column: 'user_id (in)', value: ['u1', 'u2'] });
  });

  it('counts a student enrolled in two of the instructor’s courses exactly once', async () => {
    queueRole('instructor');
    queueOwnedCourseIds(['course-A', 'course-B']);
    // Both course-A and course-B enroll student u1 — loadEnrolledStudentIdsForCourses dedupes.
    queueEnrolledStudentIds(['u1', 'u1']);
    queue('user', {
      data: [{ user_id: 'u1', username: 'alice', first_name: 'Alice', last_name: 'Smith' }],
      error: null,
    });

    const res = await GET(makeRequest('valid-token'));
    const body = await res.json();

    expect(body.students).toHaveLength(1);
    expect(h.state.filters).toContainEqual({ table: 'user', column: 'user_id (in)', value: ['u1'] });
  });

  it('returns 200 with an empty list, without querying student_course or user, when the instructor owns no courses', async () => {
    queueRole('instructor');
    queueOwnedCourseIds([]);

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.students).toEqual([]);
    expect(h.state.tables).not.toContain('student_course');
    // Only the role check hits "user" — the data query is skipped once studentIds is empty.
    expect(h.state.tables.filter((t) => t === 'user')).toHaveLength(1);
  });

  it('returns 200 with an empty list when the instructor’s courses have no enrollees', async () => {
    queueRole('instructor');
    queueOwnedCourseIds(['course-1']);
    queueEnrolledStudentIds([]);

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.students).toEqual([]);
  });

  it('filters the user table by role = student', async () => {
    queueRole('instructor');
    queueOwnedCourseIds(['course-1']);
    queueEnrolledStudentIds(['u1']);
    queue('user', { data: [], error: null });

    await GET(makeRequest('valid-token'));

    const studentFilter = h.state.filters.find(
      (f) => f.table === 'user' && f.column === 'role' && f.value === 'student',
    );
    expect(studentFilter).toBeDefined();
  });

  it('returns 500 when the database returns an error', async () => {
    queueRole('instructor');
    queueOwnedCourseIds(['course-1']);
    queueEnrolledStudentIds(['u1']);
    queue('user', { data: null, error: { message: 'DB failure' } });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB failure');
  });

  it('returns 500 when the owned-courses lookup fails', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: { message: 'DB failure' } });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(500);
  });

  describe('?scope=all', () => {
    it('returns every student in the system, without touching course or student_course', async () => {
      queueRole('instructor');
      queue('user', {
        data: [
          { user_id: 'u1', username: 'alice', first_name: 'Alice', last_name: 'Smith' },
          { user_id: 'u3', username: 'carol', first_name: 'Carol', last_name: 'White' },
        ],
        error: null,
      });

      const res = await GET(makeRequest('valid-token', '?scope=all'));
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.students).toHaveLength(2);
      expect(h.state.tables).not.toContain('course');
      expect(h.state.tables).not.toContain('student_course');
      expect(h.state.filters.find((f) => f.column === 'user_id (in)')).toBeUndefined();
    });
  });
});
