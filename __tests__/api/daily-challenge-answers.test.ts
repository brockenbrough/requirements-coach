import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same harness shape as __tests__/api/daily-challenge.test.ts, extended with update()/is() —
// this route is the only one of the two that writes via UPDATE instead of INSERT.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    updates: [] as { table: string; payload: unknown }[],
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
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
          ? { data: { user: { id: 'user-123' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { POST } from '../../app/api/daily-challenge/[attemptId]/answers/route';

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

const baseAttempt = {
  daily_challenge_attempt_id: 'attempt-1',
  user_id: 'user-123',
  question_id: 'q-1',
  challenge_date: '2026-08-14',
  started_at: '2026-08-14T10:00:00.000Z',
  deadline_at: future,
  submitted_option: null,
  is_correct: null,
  score: null,
  submitted_at: null,
};

const questionPlain = {
  question_id: 'q-1',
  question_prompt: 'What is a good acceptance criterion?',
  difficulty_level: 1,
  activity_type: 'IDENTIFY_WEAK_USER_STORIES',
  max_score: 25,
};

const questionToAnswerWithSolution = [
  { answer: { answer_id: 'a-1', option_text: 'Option 1', explanation: 'Because of X.', is_correct: true } },
  { answer: { answer_id: 'a-2', option_text: 'Option 2', explanation: 'Because of Y.', is_correct: false } },
];

function req(body: object | null, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/daily-challenge/attempt-1/answers', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function call(body: object | null, token: string | null = 'valid-token') {
  return POST(req(body, token), { params: { attemptId: 'attempt-1' } });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.updates = [];
  h.state.tables = [];
});

describe('POST /api/daily-challenge/{attemptId}/answers', () => {
  it('returns 401 without a token', async () => {
    expect((await call(null, null)).status).toBe(401);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await POST(
      new Request('http://localhost/api/daily-challenge/attempt-1/answers', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer valid-token' },
        body: '{ not json',
      }),
      { params: { attemptId: 'attempt-1' } },
    );
    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown or not-owned attempt', async () => {
    queue('daily_challenge_attempt', { data: null, error: null });

    const response = await call({ selectedOptionId: 'a-1' });

    expect(response.status).toBe(404);
  });

  it('returns 409 with the recorded result when already submitted', async () => {
    const submitted = {
      ...baseAttempt,
      submitted_option: 'a-1',
      is_correct: true,
      score: 50,
      submitted_at: '2026-08-14T10:00:30.000Z',
    };
    queue('daily_challenge_attempt', { data: submitted, error: null });
    queue('question', { data: questionPlain, error: null });
    queue('question_to_answer', { data: questionToAnswerWithSolution, error: null });

    const response = await call({ selectedOptionId: 'a-2' }); // resubmitting with a different option changes nothing
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.correct).toBe(true);
    expect(body.score).toBe(50);
    expect(body.explanation).toBe('Because of X.');
  });

  it('returns 409 without writing anything once the deadline has passed', async () => {
    queue('daily_challenge_attempt', { data: { ...baseAttempt, deadline_at: past }, error: null });

    const response = await call({ selectedOptionId: 'a-1' });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.expired).toBe(true);
    expect(h.state.updates).toHaveLength(0);
    expect(h.state.tables).toEqual(['daily_challenge_attempt']);
  });

  it('returns 400 when the option does not belong to the question', async () => {
    queue('daily_challenge_attempt', { data: baseAttempt, error: null });
    queue('question_to_answer', { data: null, error: null });

    const response = await call({ selectedOptionId: 'a-from-another-question' });

    expect(response.status).toBe(400);
    expect(h.state.updates).toHaveLength(0);
  });

  it('awards double the question max_score for a correct answer', async () => {
    queue('daily_challenge_attempt', { data: baseAttempt, error: null });
    queue('question_to_answer', { data: { answer: { answer_id: 'a-1', is_correct: true, explanation: 'Because of X.' } }, error: null });
    queue('question', { data: { max_score: 25 }, error: null });
    queue('daily_challenge_attempt', {
      data: { ...baseAttempt, submitted_option: 'a-1', is_correct: true, score: 50, submitted_at: '2026-08-14T10:00:30.000Z' },
      error: null,
    });

    const response = await call({ selectedOptionId: 'a-1' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.correct).toBe(true);
    expect(body.score).toBe(50);
    expect(body.explanation).toBe('Because of X.');
  });

  it('awards zero points for an incorrect answer', async () => {
    queue('daily_challenge_attempt', { data: baseAttempt, error: null });
    queue('question_to_answer', { data: { answer: { answer_id: 'a-2', is_correct: false, explanation: 'Because of Y.' } }, error: null });
    queue('question', { data: { max_score: 25 }, error: null });
    queue('daily_challenge_attempt', {
      data: { ...baseAttempt, submitted_option: 'a-2', is_correct: false, score: 0, submitted_at: '2026-08-14T10:00:30.000Z' },
      error: null,
    });

    const response = await call({ selectedOptionId: 'a-2' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.correct).toBe(false);
    expect(body.score).toBe(0);
  });

  it('returns 409 when a concurrent submit already won the race', async () => {
    queue('daily_challenge_attempt', { data: baseAttempt, error: null }); // initial select
    queue('question_to_answer', { data: { answer: { answer_id: 'a-1', is_correct: true, explanation: 'Because of X.' } }, error: null });
    queue('question', { data: { max_score: 25 }, error: null });
    queue('daily_challenge_attempt', { data: null, error: null }); // update finds no row (lost race)
    const won = { ...baseAttempt, submitted_option: 'a-2', is_correct: false, score: 0, submitted_at: '2026-08-14T10:00:30.000Z' };
    queue('daily_challenge_attempt', { data: won, error: null }); // refetch
    queue('question', { data: questionPlain, error: null });
    queue('question_to_answer', { data: questionToAnswerWithSolution, error: null });

    const response = await call({ selectedOptionId: 'a-1' });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.correct).toBe(false);
    expect(body.explanation).toBe('Because of Y.');
  });
});
