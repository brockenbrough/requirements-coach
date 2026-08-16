import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ column, value });
        return builder;
      },
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

/**
 * Queues a course link + enrollment so checkActivityAccess (lib/activityCourseQueries.ts)
 * resolves to 'ok' — every activity is now linked to exactly one course, and this route only
 * serves questions to a caller enrolled in it.
 */
function queueEnrolled() {
  queue('activity_type_course', { data: { course_id: 'course-1', course: { course_name: 'Software Requirements' } }, error: null });
  queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
}

/**
 * Queues a successful activity_type lookup (GitHub #347: isActivityType is now a DB read) plus
 * an enrolled course link, the two checks every path past "does this activity exist" now runs.
 */
function queueValidActivityType(activityType: string) {
  queue('activity_type', { data: { activity_type: activityType }, error: null });
  queueEnrolled();
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
      const queued = h.state.queues[table]?.shift() ?? { data: [], error: null };
      return h.makeBuilder(table, queued);
    },
  }),
}));

import { GET } from '../../app/api/activities/[activityType]/questions/route';

function makeRequest(activityType: string, difficulty?: string, token: string | null = 'valid-token') {
  const url = `http://localhost/api/activities/${activityType}/questions${difficulty ? `?difficulty=${difficulty}` : ''}`;
  return new Request(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

const PARAMS = (activityType: string) => ({ params: { activityType } });

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/activities/:activityType/questions', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1', null), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1', 'bad-token'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for an unknown activity type', async () => {
    // Overrides this file's default `{ data: [] }` — isActivityType needs an explicit "not
    // found" (`data: null`) to tell "no such row" apart from "found an empty list".
    queue('activity_type', { data: null, error: null });
    const res = await GET(makeRequest('UNKNOWN_ACTIVITY', '1'), PARAMS('UNKNOWN_ACTIVITY'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unknown activity type/i);
  });

  it('returns 403 when the activity has no course link at all', async () => {
    queue('activity_type', { data: { activity_type: 'IDENTIFY_WEAK_USER_STORIES' }, error: null });
    queue('activity_type_course', { data: null, error: null }); // unlinked

    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the caller is not enrolled in the activity\'s linked course', async () => {
    queue('activity_type', { data: { activity_type: 'IDENTIFY_WEAK_USER_STORIES' }, error: null });
    queue('activity_type_course', { data: { course_id: 'course-1', course: { course_name: 'Software Requirements' } }, error: null });
    queue('student_course', { data: [], error: null }); // not enrolled

    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(403);
    expect(h.state.tables).not.toContain('question');
  });

  it('returns 400 when difficulty is missing', async () => {
    queueValidActivityType('IDENTIFY_WEAK_USER_STORIES');
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/difficulty/i);
  });

  it('returns 400 when difficulty is not 1, 2, or 3', async () => {
    queueValidActivityType('IDENTIFY_WEAK_USER_STORIES');
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '5'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/difficulty/i);
  });

  it('returns an empty array when no questions exist for the combination', async () => {
    queueValidActivityType('IDENTIFY_WEAK_USER_STORIES');
    queue('question', { data: [], error: null });
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toEqual([]);
  });

  it('returns matching questions with the correct fields', async () => {
    queueValidActivityType('IDENTIFY_WEAK_USER_STORIES');
    const mockQuestions = [
      { question_id: 'q-1', question_prompt: 'Which story is weakest?', difficulty_level: 1, max_score: 25 },
      { question_id: 'q-2', question_prompt: 'Pick the worst story.', difficulty_level: 1, max_score: 25 },
    ];
    queue('question', { data: mockQuestions, error: null });

    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(2);
    expect(body.questions[0]).toMatchObject({
      question_id: 'q-1',
      question_prompt: 'Which story is weakest?',
      difficulty_level: 1,
      max_score: 25,
    });
  });

  it('filters by activity type and difficulty level', async () => {
    queueValidActivityType('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA');
    queue('question', { data: [], error: null });
    await GET(makeRequest('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', '2'), PARAMS('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'));
    // GitHub #124: filtered via the inner join alias, not the plain column.
    expect(h.state.filters).toContainEqual({ column: 'activity.activity_type', value: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA' });
    expect(h.state.filters).toContainEqual({ column: 'difficulty_level', value: 2 });
  });

  it('returns 500 when the database returns an error', async () => {
    queueValidActivityType('IDENTIFY_WEAK_USER_STORIES');
    queue('question', { data: null, error: { message: 'DB error' } });
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(500);
  });
});
