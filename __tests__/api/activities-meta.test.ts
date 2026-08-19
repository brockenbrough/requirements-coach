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
      is: () => builder,
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

/** An activity_type row as getQuizByActivityType returns it. */
function quizRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: 'MY_CUSTOM_QUIZ',
    quiz_name: 'My Custom Quiz',
    description: 'A quiz about things',
    grading_kind: 'mcq',
    creator_id: 'instructor-1',
    creator: { first_name: 'Ada', last_name: 'Brockenbrough', username: 'abrock' },
    ...overrides,
  };
}

/**
 * Queues the two-query derivation getAccessibleCourseForActivity now uses: the caller's own
 * enrolled courses (student_course), then an assembled_quiz in one of them that references the
 * catalog (assembled_quiz_catalog) — a catalog has no course of its own any more.
 *
 * The assembled quiz's own quiz_name/description are deliberately different from quizRow()'s
 * catalog fixture below, so a test asserting on them can't pass by accident if the route
 * regresses to sourcing name/description from the catalog again.
 */
function queueEnrolled(overrides: { quizName?: string | null; description?: string | null } = {}) {
  queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
  queue('assembled_quiz_catalog', {
    data: [
      {
        assembled_quiz: {
          assembled_quiz_id: 'quiz-1',
          course_id: 'course-1',
          quiz_name: 'quizName' in overrides ? overrides.quizName : 'Course-Specific Requirements Quiz',
          description: 'description' in overrides ? overrides.description : 'Assembled for this course',
          course: { course_name: 'Software Requirements' },
        },
        catalog: { quiz_name: 'My Custom Quiz', description: 'A quiz about things' },
      },
    ],
    error: null,
  });
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
    expect(h.state.tables).not.toContain('assembled_quiz_catalog');
  });

  it('returns 403 when the caller is enrolled in nothing', async () => {
    queue('activity_type', { data: quizRow(), error: null });
    queue('student_course', { data: [], error: null }); // not enrolled anywhere

    const res = await GET(req('MY_CUSTOM_QUIZ'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(403);
    expect(h.state.tables).not.toContain('assembled_quiz_catalog');
  });

  it('returns 403 when no assembled quiz in an enrolled course references the catalog', async () => {
    queue('activity_type', { data: quizRow(), error: null });
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', { data: [], error: null }); // reachable through nothing the caller is in

    const res = await GET(req('MY_CUSTOM_QUIZ'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(403);
  });

  it('returns the assembled quiz\'s own name/description, not the catalog\'s', async () => {
    queue('activity_type', { data: quizRow(), error: null });
    queueEnrolled();

    const res = await GET(req('MY_CUSTOM_QUIZ'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.activity).toEqual({
      activityType: 'MY_CUSTOM_QUIZ',
      name: 'Course-Specific Requirements Quiz',
      description: 'Assembled for this course',
      gradingKind: 'mcq',
      courseId: 'course-1',
      courseName: 'Software Requirements',
      assembledQuizId: 'quiz-1',
    });
  });

  // GitHub #583: a caller that already knows which quiz it means (the ?quiz= a student followed
  // from a course page card) can disambiguate between two quizzes composing the same catalog.
  it('accepts an assembledQuizId query param without erroring', async () => {
    queue('activity_type', { data: quizRow(), error: null });
    queueEnrolled();

    const res = await GET(req('MY_CUSTOM_QUIZ?assembledQuizId=quiz-1'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activity.assembledQuizId).toBe('quiz-1');
  });

  it('falls back to the catalog description when the assembled quiz has none', async () => {
    queue('activity_type', { data: quizRow(), error: null });
    queueEnrolled({ description: null });

    const res = await GET(req('MY_CUSTOM_QUIZ'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.activity.description).toBe('A quiz about things');
  });

  it('returns 500 when the activity lookup fails', async () => {
    queue('activity_type', { data: null, error: { message: 'DB down' } });

    const res = await GET(req('MY_CUSTOM_QUIZ'), PARAMS('MY_CUSTOM_QUIZ'));
    expect(res.status).toBe(500);
  });
});
