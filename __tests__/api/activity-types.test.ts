import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
    deletes: [] as { table: string; column: string; value: unknown }[],
    user: { id: 'instructor-1' } as { id: string } | null,
  };

  function makeBuilder(table: string, result: Result) {
    let isDelete = false;

    const builder: Record<string, unknown> = {
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      delete: () => {
        isDelete = true;
        return builder;
      },
      select: () => builder,
      eq: (column: string, value: unknown) => {
        if (isDelete) state.deletes.push({ table, column, value });
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
    from: (table: string) => {
      h.state.tables.push(table);
      const queued = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, queued);
    },
    auth: {
      getUser: async () => ({
        data: { user: h.state.user },
        error: null,
      }),
    },
  }),
}));

import { POST } from '../../app/api/activities/types/route';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/activities/types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

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

function queueOwnedCourse(overrides: Partial<Record<string, unknown>> = {}) {
  queue('course', { data: courseRow(overrides), error: null });
}

/** activity_type as the insert's .select(...).maybeSingle() returns it. */
function activityTypeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: 'MY_CUSTOM_QUIZ',
    quiz_name: 'My Custom Quiz',
    description: null,
    ...overrides,
  };
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return { name: 'My Custom Quiz', courseId: 'course-1', ...overrides };
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
  h.state.deletes = [];
  h.state.user = { id: 'instructor-1' };
});

describe('POST /api/activities/types', () => {
  it('returns 401 when no token is provided', async () => {
    h.state.user = null;
    const req = new Request('http://localhost/api/activities/types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody()),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is not an instructor', async () => {
    queueRole('student');
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest({ courseId: 'course-1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });

  it('returns 400 when name is blank', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest(validBody({ name: '   ' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 when courseId is missing', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest({ name: 'My Custom Quiz' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/courseId/i);
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 400 when courseId is blank', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest(validBody({ courseId: '   ' })));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name has no letters or numbers to derive a key from', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest(validBody({ name: '!!! ---' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/letter or number/i);
  });

  it('returns 400 when the derived key would exceed 50 characters', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest(validBody({ name: 'A'.repeat(51) })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too long/i);
  });

  it('returns 400 when description is not a string', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest(validBody({ description: 123 })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description/i);
  });

  it('returns 404 when the course does not exist, without touching activity_type', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: null });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Course not found.');
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('returns 403 with an empty body when the caller does not own the course', async () => {
    queueRole('instructor');
    queueOwnedCourse({ creator_id: 'some-other-instructor' });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('derives the key by upper-casing and collapsing non-alphanumeric runs, matching the built-in keys\' own format', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queue('activity_type', { data: activityTypeRow({ activity_type: 'IDENTIFY_WEAK_USER_STORIES', quiz_name: 'Identify Weak User Stories' }), error: null });
    queue('activity_type_course', { error: null });

    await POST(makeRequest(validBody({ name: 'Identify Weak User Stories' })));

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect((insert?.payload as { activity_type: string }).activity_type).toBe('IDENTIFY_WEAK_USER_STORIES');
  });

  it('creates the quiz, links it to the owned course, and returns the derived key, name, description, and course', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queue('activity_type', { data: activityTypeRow({ description: 'A quiz about things' }), error: null });
    queue('activity_type_course', { error: null });

    const res = await POST(makeRequest(validBody({ description: 'A quiz about things' })));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.quiz).toEqual({
      activityType: 'MY_CUSTOM_QUIZ',
      name: 'My Custom Quiz',
      description: 'A quiz about things',
      courseId: 'course-1',
      courseName: 'Software Requirements',
    });

    const linkInsert = h.state.inserts.find((i) => i.table === 'activity_type_course');
    expect(linkInsert?.payload).toEqual({ activity_type: 'MY_CUSTOM_QUIZ', course_id: 'course-1' });
  });

  it('trims name, and an empty/whitespace-only description is stored as null rather than an empty string', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queue('activity_type', { data: activityTypeRow(), error: null });
    queue('activity_type_course', { error: null });

    await POST(makeRequest(validBody({ name: '  My Custom Quiz  ', description: '   ' })));

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect(insert?.payload).toMatchObject({ quiz_name: 'My Custom Quiz', description: null });
  });

  it('sets creator_id from the authenticated instructor, not the request body', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queue('activity_type', { data: activityTypeRow(), error: null });
    queue('activity_type_course', { error: null });

    await POST(makeRequest(validBody()));

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect((insert?.payload as { creator_id: string }).creator_id).toBe('instructor-1');
  });

  // The whole point of GitHub #347's "report, don't auto-suffix": the instructor picks a
  // different name themselves, so there must be exactly one insert attempt, not a retry loop.
  it('returns 409 on a name collision, without retrying with a suffixed key or linking a course', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queue('activity_type', { data: null, error: { code: '23505', message: 'duplicate key' } });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
    expect(h.state.inserts.filter((i) => i.table === 'activity_type')).toHaveLength(1);
    expect(h.state.tables).not.toContain('activity_type_course');
  });

  it('returns 500 when the database returns a non-collision error', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queue('activity_type', { data: null, error: { code: '99999', message: 'DB error' } });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });

  it('deletes the activity_type row it just inserted when linking the course fails', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queue('activity_type', { data: activityTypeRow(), error: null });
    queue('activity_type_course', { error: { message: 'link insert failed' } });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('link insert failed');

    expect(h.state.deletes).toContainEqual({ table: 'activity_type', column: 'activity_type', value: 'MY_CUSTOM_QUIZ' });
  });
});
