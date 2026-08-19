import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    updates: [] as { table: string; payload: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      range: () => builder,
      order: () => builder,
      update: (payload: unknown) => {
        state.updates.push({ table, payload });
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

import { GET, PATCH } from '../../app/api/instructor/courses/[id]/route';

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
    semester: null,
    cover_image_url: null,
    ...overrides,
  };
}

function sessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    session_id: 'session-1',
    user_id: 'student-1',
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    difficulty_level: 1,
    started_at: '2026-08-01T10:00:00',
    ended_at: '2026-08-01T10:10:00',
    status: 'completed',
    cumulative_score: 3,
    max_score: 4,
    passed: true,
    student: { first_name: 'Alex', last_name: 'Chen', username: 'achen', role: 'student' },
    ...overrides,
  };
}

function getRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses/course-1', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function patchRequest(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses/course-1', {
    method: 'PATCH',
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
  h.state.updates = [];
});

describe('GET /api/instructor/courses/[id]', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(getRequest(null), params);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await GET(getRequest(), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 404 when the course does not exist', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(404);
  });

  it('returns 403 with an empty body when the caller does not own the course', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ creator_id: 'someone-else' }), error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns a roster where a zero-attempt enrolled student still appears', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', {
      data: [
        { user_id: 'student-1', student: { first_name: 'Alex', last_name: 'Chen', username: 'achen' } },
        { user_id: 'student-2', student: { first_name: 'Sam', last_name: 'Lee', username: 'slee' } },
      ],
      error: null,
    });
    // Only student-1 has a session_log row — student-2 never attempted anything.
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.course).toEqual({
      id: 'course-1',
      name: 'Software Requirements',
      code: 'ABCDEF',
      createdAt: '2026-08-11T10:00:00',
      semester: null,
      coverImageUrl: null,
    });
    expect(body.students).toEqual([
      { id: 'student-1', name: 'Alex Chen', attempts: 1, averageScore: 75, abandonedCount: 0, needsAttention: false },
      { id: 'student-2', name: 'Sam Lee', attempts: 0, averageScore: null, abandonedCount: 0, needsAttention: false },
    ]);
  });

  it('returns an empty roster without querying session_log when no students are enrolled', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: [], error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.students).toEqual([]);
    expect(h.state.tables).not.toContain('session_log');
  });
});

describe('PATCH /api/instructor/courses/[id]', () => {
  it('returns 401 without a token', async () => {
    const res = await PATCH(patchRequest({ name: 'New name' }, null), params);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the course does not exist', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: null });

    const res = await PATCH(patchRequest({ name: 'New name' }), params);
    expect(res.status).toBe(404);
  });

  it('returns 403 with an empty body when the caller does not own the course', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ creator_id: 'someone-else' }), error: null });

    const res = await PATCH(patchRequest({ name: 'New name' }), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 400 for a blank name', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });

    const res = await PATCH(patchRequest({ name: '   ' }), params);
    expect(res.status).toBe(400);
    expect(h.state.updates).toEqual([]);
  });

  it('renames the course and returns the updated row', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('course', { data: courseRow({ course_name: 'New name' }), error: null });

    const res = await PATCH(patchRequest({ name: 'New name' }), params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.course).toEqual({
      id: 'course-1',
      name: 'New name',
      code: 'ABCDEF',
      createdAt: '2026-08-11T10:00:00',
      semester: null,
      coverImageUrl: null,
    });
    expect(h.state.updates).toEqual([{ table: 'course', payload: { course_name: 'New name' } }]);
  });

  it('returns 400 for a non-string coverImageUrl', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });

    const res = await PATCH(patchRequest({ name: 'New name', coverImageUrl: 123 }), params);
    expect(res.status).toBe(400);
    expect(h.state.updates).toEqual([]);
  });

  it('updates the cover image alongside the name when one is given', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('course', {
      data: courseRow({ course_name: 'New name', cover_image_url: 'https://example.com/course-covers/instructor-1/x.png' }),
      error: null,
    });

    const res = await PATCH(
      patchRequest({ name: 'New name', coverImageUrl: 'https://example.com/course-covers/instructor-1/x.png' }),
      params,
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.course.coverImageUrl).toBe('https://example.com/course-covers/instructor-1/x.png');
    expect(h.state.updates).toEqual([
      { table: 'course', payload: { course_name: 'New name', cover_image_url: 'https://example.com/course-covers/instructor-1/x.png' } },
    ]);
  });

  it('leaves the stored cover image untouched when the field is omitted from the body', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ cover_image_url: 'https://example.com/course-covers/instructor-1/x.png' }), error: null });
    queue('course', {
      data: courseRow({ course_name: 'New name', cover_image_url: 'https://example.com/course-covers/instructor-1/x.png' }),
      error: null,
    });

    const res = await PATCH(patchRequest({ name: 'New name' }), params);
    expect(res.status).toBe(200);

    expect(h.state.updates).toEqual([{ table: 'course', payload: { course_name: 'New name' } }]);
  });

  it('clears the cover image when explicitly set to null, reverting to the deterministic default', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ cover_image_url: 'https://example.com/course-covers/instructor-1/x.png' }), error: null });
    queue('course', { data: courseRow({ course_name: 'New name', cover_image_url: null }), error: null });

    const res = await PATCH(patchRequest({ name: 'New name', coverImageUrl: null }), params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.course.coverImageUrl).toBeNull();
    expect(h.state.updates).toEqual([{ table: 'course', payload: { course_name: 'New name', cover_image_url: null } }]);
  });

  it('returns 400 for a non-string semester', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });

    const res = await PATCH(patchRequest({ name: 'New name', semester: 123 }), params);
    expect(res.status).toBe(400);
    expect(h.state.updates).toEqual([]);
  });

  it('updates the semester alongside the name when one is given', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('course', { data: courseRow({ course_name: 'New name', semester: 'SoSe 2026' }), error: null });

    const res = await PATCH(patchRequest({ name: 'New name', semester: 'SoSe 2026' }), params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.course.semester).toBe('SoSe 2026');
    expect(h.state.updates).toEqual([{ table: 'course', payload: { course_name: 'New name', semester: 'SoSe 2026' } }]);
  });

  it('leaves the stored semester untouched when the field is omitted from the body', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ semester: 'SoSe 2026' }), error: null });
    queue('course', { data: courseRow({ course_name: 'New name', semester: 'SoSe 2026' }), error: null });

    const res = await PATCH(patchRequest({ name: 'New name' }), params);
    expect(res.status).toBe(200);

    expect(h.state.updates).toEqual([{ table: 'course', payload: { course_name: 'New name' } }]);
  });

  it('clears the semester when explicitly set to null', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ semester: 'SoSe 2026' }), error: null });
    queue('course', { data: courseRow({ course_name: 'New name', semester: null }), error: null });

    const res = await PATCH(patchRequest({ name: 'New name', semester: null }), params);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.course.semester).toBeNull();
    expect(h.state.updates).toEqual([{ table: 'course', payload: { course_name: 'New name', semester: null } }]);
  });
});
