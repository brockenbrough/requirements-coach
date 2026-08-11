import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
    updates: [] as { table: string; payload: unknown }[],
    deletes: [] as { table: string; column: string; value: unknown }[],
    filters: [] as { table: string; column: string; value: unknown }[],
    orders: [] as { table: string; column: string; ascending: boolean }[],
  };

  function makeBuilder(table: string, result: Result) {
    let isDelete = false;

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      update: (payload: unknown) => {
        state.updates.push({ table, payload });
        return builder;
      },
      delete: () => {
        isDelete = true;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        if (isDelete) {
          state.deletes.push({ table, column, value });
        } else {
          state.filters.push({ table, column, value });
        }
        return builder;
      },
      in: (column: string, value: unknown) => {
        if (isDelete) {
          state.deletes.push({ table, column, value });
        }
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        state.orders.push({ table, column, ascending: opts?.ascending ?? true });
        return builder;
      },
      limit: () => builder,
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

import { GET, POST } from '../../app/api/instructor/questions/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function request(token?: string) {
  return new Request('http://localhost/api/instructor/questions', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function postRequest(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function validAnswers() {
  return [
    { optionText: 'Wrong option', isCorrect: false, explanation: 'Incorrect: not this one.' },
    { optionText: 'Right option', isCorrect: true, explanation: 'Correct: this is the weakest one.' },
  ];
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    questionPrompt: 'Which story is weakest?',
    activityType: 'IDENTIFY_WEAK_USER_STORIES',
    difficultyLevel: 1,
    answers: validAnswers(),
    ...overrides,
  };
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
  h.state.inserts = [];
  h.state.updates = [];
  h.state.deletes = [];
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

describe('POST /api/instructor/questions', () => {
  it('returns 401 without a token', async () => {
    const res = await POST(postRequest(validBody(), null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('question');
  });

  it('returns 400 for invalid JSON', async () => {
    queueRole('instructor');
    const res = await POST(
      new Request('http://localhost/api/instructor/questions', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing questionPrompt with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ questionPrompt: '  ' })));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid activityType with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ activityType: 'NOT_REAL' })));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid difficultyLevel with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ difficultyLevel: 9 })));
    expect(res.status).toBe(400);
  });

  it('rejects fewer than 2 answers with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ answers: [validAnswers()[0]] })));
    expect(res.status).toBe(400);
  });

  it('rejects zero correct answers with 400', async () => {
    queueRole('instructor');
    const answers = validAnswers().map((a) => ({ ...a, isCorrect: false }));
    const res = await POST(postRequest(validBody({ answers })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Exactly one answer must be correct.');
  });

  it('rejects two correct answers with 400', async () => {
    queueRole('instructor');
    const answers = validAnswers().map((a) => ({ ...a, isCorrect: true }));
    const res = await POST(postRequest(validBody({ answers })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Exactly one answer must be correct.');
  });

  it('creates the question and its answers, assigning order_number and max_score server-side', async () => {
    queueRole('instructor');
    queue('question', { data: null, error: null }); // MAX(order_number) — empty pool
    queue('question', { data: null, error: null }); // question insert
    queue('answer', { data: null, error: null }); // answer 1 insert
    queue('question_to_answer', { data: null, error: null }); // link 1
    queue('answer', { data: null, error: null }); // answer 2 insert
    queue('question_to_answer', { data: null, error: null }); // link 2

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(typeof body.questionId).toBe('string');
    expect(body.answerIds).toHaveLength(2);

    const questionInsert = h.state.inserts.find((i) => i.table === 'question');
    expect(questionInsert?.payload).toMatchObject({
      question_prompt: 'Which story is weakest?',
      activity_type: 'IDENTIFY_WEAK_USER_STORIES',
      difficulty_level: 1,
      order_number: 1,
      max_score: 25,
      user_id: 'instructor-1',
    });
  });

  it('assigns order_number as MAX + 1, scoped to the activity type', async () => {
    queueRole('instructor');
    queue('question', { data: { order_number: 7 }, error: null }); // MAX(order_number) = 7
    queue('question', { data: null, error: null });
    queue('answer', { data: null, error: null });
    queue('question_to_answer', { data: null, error: null });
    queue('answer', { data: null, error: null });
    queue('question_to_answer', { data: null, error: null });

    await POST(postRequest(validBody()));

    const questionInsert = h.state.inserts.find((i) => i.table === 'question');
    expect((questionInsert?.payload as { order_number: number }).order_number).toBe(8);
    expect(h.state.filters).toContainEqual({
      table: 'question',
      column: 'activity_type',
      value: 'IDENTIFY_WEAK_USER_STORIES',
    });
  });

  it('rolls back the question when an answer insert fails partway through', async () => {
    queueRole('instructor');
    queue('question', { data: null, error: null }); // MAX(order_number)
    queue('question', { data: null, error: null }); // question insert
    queue('answer', { data: null, error: null }); // answer 1 insert succeeds
    queue('question_to_answer', { data: null, error: null }); // link 1 succeeds
    queue('answer', { data: null, error: { message: 'answer insert failed' } }); // answer 2 insert fails

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('answer insert failed');

    const questionId = (h.state.inserts.find((i) => i.table === 'question')?.payload as { question_id: string })
      .question_id;
    const answerId = (h.state.inserts.find((i) => i.table === 'answer')?.payload as { answer_id: string }).answer_id;

    expect(h.state.deletes).toContainEqual({ table: 'question_to_answer', column: 'question_id', value: questionId });
    expect(h.state.deletes).toContainEqual({ table: 'answer', column: 'answer_id', value: [answerId] });
    expect(h.state.deletes).toContainEqual({ table: 'question', column: 'question_id', value: questionId });
  });

  it('rolls back the question when the question_to_answer link insert fails', async () => {
    queueRole('instructor');
    queue('question', { data: null, error: null }); // MAX(order_number)
    queue('question', { data: null, error: null }); // question insert
    queue('answer', { data: null, error: null }); // answer 1 insert succeeds
    queue('question_to_answer', { data: null, error: { message: 'link insert failed' } }); // link 1 fails

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('link insert failed');

    const questionId = (h.state.inserts.find((i) => i.table === 'question')?.payload as { question_id: string })
      .question_id;
    const answerId = (h.state.inserts.find((i) => i.table === 'answer')?.payload as { answer_id: string }).answer_id;

    expect(h.state.deletes).toContainEqual({ table: 'question_to_answer', column: 'question_id', value: questionId });
    expect(h.state.deletes).toContainEqual({ table: 'answer', column: 'answer_id', value: [answerId] });
    expect(h.state.deletes).toContainEqual({ table: 'question', column: 'question_id', value: questionId });
  });
});
