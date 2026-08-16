import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
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

import { GET } from '../../app/api/activities/[activityType]/route';

function req(activityType: string, token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/activities/${activityType}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const PARAMS = (activityType: string) => ({ params: { activityType } });

/** An activity_type row as getQuizByActivityType's embed actually returns it. */
function quizRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: 'MY_CUSTOM_QUIZ',
    quiz_name: 'My Custom Quiz',
    description: 'A quiz about things',
    creator_id: 'instructor-1',
    creator: { first_name: 'Ada', last_name: 'Brockenbrough', username: 'abrock' },
    activity_type_course: [{ course_id: 'course-1', course: { course_name: 'Software Requirements' } }],
    ...overrides,
  };
}

function queueEnrolled() {
  queue('activity_type_course', { data: { course_id: 'course-1', course: { course_name: 'Software Requirements' } }, error: null });
  queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
});

describe('GET /api/activities/:activityType', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(req('MY_CUSTOM_QUIZ', null), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await GET(req('MY_CUSTOM_QUIZ', 'bad-token'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the activity does not exist', async () => {
    queue('activity_type', { data: null, error: null });

    const res = await GET(req('UNKNOWN'), PARAMS('UNKNOWN'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
    expect(h.state.tables).not.toContain('activity_type_course');
  });

  it('returns 403 when the activity has no course link at all', async () => {
    queue('activity_type', { data: quizRow({ activity_type_course: null }), error: null });
    queue('activity_type_course', { data: null, error: null }); // unlinked

    const res = await GET(req('MY_CUSTOM_QUIZ'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the caller is not enrolled in the linked course', async () => {
    queue('activity_type', { data: quizRow(), error: null });
    queue('activity_type_course', { data: { course_id: 'course-1', course: { course_name: 'Software Requirements' } }, error: null });
    queue('student_course', { data: [], error: null }); // not enrolled

    const res = await GET(req('MY_CUSTOM_QUIZ'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(403);
  });

  it('returns the activity metadata for an enrolled caller', async () => {
    queue('activity_type', { data: quizRow(), error: null });
    queueEnrolled();

    const res = await GET(req('MY_CUSTOM_QUIZ'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.activity).toEqual({
      activityType: 'MY_CUSTOM_QUIZ',
      name: 'My Custom Quiz',
      description: 'A quiz about things',
      courseId: 'course-1',
      courseName: 'Software Requirements',
    });
  });

  it('returns 500 when the activity lookup fails', async () => {
    queue('activity_type', { data: null, error: { message: 'DB down' } });

    const res = await GET(req('MY_CUSTOM_QUIZ'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(500);
  });
});
