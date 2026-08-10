import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same harness shape as __tests__/api/instructor-student-history.test.ts: eq() is recorded, not
// a no-op, and queries without .single()/.maybeSingle() resolve because the builder is thenable.
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

import { GET } from '../../app/api/instructor/quizzes/[activityType]/[difficultyLevel]/questions/route';

const ACTIVITY_TYPE = 'IDENTIFY_WEAK_USER_STORIES';

function queueCallerRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/instructor/quizzes/${ACTIVITY_TYPE}/1/questions`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function params(activityType = ACTIVITY_TYPE, difficultyLevel = '1') {
  return { params: { activityType, difficultyLevel } };
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/instructor/quizzes/:activityType/:difficultyLevel/questions', () => {
  it('returns 401 without a token', async () => {
    const response = await GET(req(null), params());
    expect(response.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('bad-token'), params());
    expect(response.status).toBe(401);
  });

  it('rejects a student caller with 403 and an empty body, before touching questions', async () => {
    queueCallerRole('student');

    const response = await GET(req(), params());

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(h.state.tables).toEqual(['user']);
  });

  it('returns 404 for an unknown activityType, before querying questions', async () => {
    queueCallerRole('instructor');

    const response = await GET(req(), params('NOT_A_REAL_ACTIVITY'));

    expect(response.status).toBe(404);
    expect(h.state.tables).toEqual(['user']);
  });

  it('returns 404 for a difficultyLevel outside 1-3, before querying questions', async () => {
    queueCallerRole('instructor');

    const response = await GET(req(), params(ACTIVITY_TYPE, '9'));

    expect(response.status).toBe(404);
    expect(h.state.tables).toEqual(['user']);
  });

  it('returns 404 when no question exists for this activityType/difficultyLevel at all', async () => {
    queueCallerRole('instructor');
    queue('question', { data: [], error: null });

    const response = await GET(req(), params());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/quiz not found/i);
  });

  it('returns 403 when the quiz exists but none of its questions belong to the caller', async () => {
    queueCallerRole('instructor');
    queue('question', {
      data: [{ question_id: 'q1', question_prompt: 'Prompt', user_id: 'someone-else', question_to_answer: [] }],
      error: null,
    });

    const response = await GET(req(), params());

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
  });

  it('returns only the caller\'s own questions, shaped with answers and is_correct', async () => {
    queueCallerRole('instructor');
    queue('question', {
      data: [
        {
          question_id: 'q1',
          question_prompt: 'Which user story is weakest?',
          user_id: 'instructor-1',
          question_to_answer: [
            { answer: { answer_id: 'a1', option_text: 'Weak one', is_correct: true } },
            { answer: { answer_id: 'a2', option_text: 'Strong one', is_correct: false } },
          ],
        },
        {
          question_id: 'q2',
          question_prompt: 'Someone else\'s question',
          user_id: 'someone-else',
          question_to_answer: [],
        },
      ],
      error: null,
    });

    const response = await GET(req(), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activityType).toBe(ACTIVITY_TYPE);
    expect(body.difficultyLevel).toBe(1);
    expect(body.questions).toEqual([
      {
        question_id: 'q1',
        question_title: 'Which user story is weakest?',
        answers: [
          { answer_id: 'a1', answer_title: 'Weak one', is_correct: true },
          { answer_id: 'a2', answer_title: 'Strong one', is_correct: false },
        ],
      },
    ]);
  });

  it('returns 500 when the question query fails', async () => {
    queueCallerRole('instructor');
    queue('question', { data: null, error: { message: 'boom' } });

    const response = await GET(req(), params());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
  });

  it('filters on the requested activity type and difficulty level', async () => {
    queueCallerRole('instructor');
    queue('question', { data: [], error: null });

    await GET(req(), params());

    expect(h.state.filters).toContainEqual({ table: 'question', column: 'activity_type', value: ACTIVITY_TYPE });
    expect(h.state.filters).toContainEqual({ table: 'question', column: 'difficulty_level', value: 1 });
  });
});
