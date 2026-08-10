import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { table: string; column: string; value: unknown }[],
    orders: [] as { table: string; column: string; ascending: boolean }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        state.orders.push({ table, column, ascending: opts?.ascending ?? true });
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

import { GET } from '../../app/api/instructor/questions/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function request(token?: string) {
  return new Request('http://localhost/api/instructor/questions', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function questionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    question_id: 'q-1',
    question_prompt: 'Which story is weakest?',
    difficulty_level: 1,
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    question_to_answer: [
      { answer: { answer_id: 'a-1', option_text: 'Wrong option', is_correct: false, explanation: 'Incorrect: not this one.' } },
      { answer: { answer_id: 'a-2', option_text: 'Right option', is_correct: true, explanation: 'Correct: this is the weakest one.' } },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
  h.state.orders = [];
});

describe('GET /api/instructor/questions', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await GET(request('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await GET(request('valid-token'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('question');
  });

  it('returns 200 with questions mapped to QuizQuestion, including isCorrect and explanation', async () => {
    queueRole('instructor');
    queue('question', { data: [questionRow()], error: null });

    const res = await GET(request('valid-token'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0]).toEqual({
      id: 'q-1',
      quizType: 'IDENTIFY_WEAK_USER_STORIES',
      level: 1,
      questionText: 'Which story is weakest?',
      answerOptions: [
        { id: 'a-1', text: 'Wrong option', isCorrect: false },
        { id: 'a-2', text: 'Right option', isCorrect: true },
      ],
      // The mapped explanation is the *correct* answer's explanation, not a question-level
      // free-text field — the database only stores explanation per answer option.
      explanation: 'Correct: this is the weakest one.',
    });
  });

  it('returns 200 with an empty list for an empty bank', async () => {
    queueRole('instructor');
    queue('question', { data: [], error: null });

    const res = await GET(request('valid-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toEqual([]);
  });

  it('orders by order_number ascending', async () => {
    queueRole('instructor');
    queue('question', { data: [], error: null });

    await GET(request('valid-token'));

    expect(h.state.orders).toContainEqual({ table: 'question', column: 'order_number', ascending: true });
  });

  it('filters question by user_id = the calling instructor, so only their own questions are fetched', async () => {
    queueRole('instructor');
    queue('question', { data: [], error: null });

    await GET(request('valid-token'));

    expect(h.state.filters).toContainEqual({ table: 'question', column: 'user_id', value: 'instructor-1' });
  });

  it('returns 500 when the database returns an error', async () => {
    queueRole('instructor');
    queue('question', { data: null, error: { message: 'DB failure' } });

    const res = await GET(request('valid-token'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB failure');
  });
});
