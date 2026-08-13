import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    updates: [] as { table: string; payload: unknown }[],
    deletes: [] as { table: string; column: string; value: unknown }[],
    filters: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    let isDelete = false;

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: () => builder,
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
      order: () => builder,
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

import { PATCH } from '../../app/api/instructor/questions/[questionId]/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

/** Queues a successful activity_type lookup (GitHub #347: isActivityType is now a DB read). */
function queueValidActivityType(activityType = 'IDENTIFY_WEAK_USER_STORIES') {
  queue('activity_type', { data: { activity_type: activityType }, error: null });
}

function queueOwnedQuestion(userId = 'instructor-1') {
  queue('question', { data: { question_id: 'q-1', user_id: userId }, error: null });
}

function queueExistingLinks(answerIds = ['a-1', 'a-2']) {
  queue(
    'question_to_answer',
    { data: answerIds.map((answer_id) => ({ answer_id })), error: null },
  );
}

function validAnswers() {
  return [
    { id: 'a-1', optionText: 'Wrong updated', isCorrect: false },
    { id: 'a-2', optionText: 'Right updated', isCorrect: true, explanation: 'Because reasons.' },
  ];
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    questionPrompt: 'Updated prompt?',
    activityType: 'IDENTIFY_WEAK_USER_STORIES',
    difficultyLevel: 2,
    answers: validAnswers(),
    ...overrides,
  };
}

function call(body: unknown, token: string | null = 'valid-token', questionId = 'q-1') {
  const request = new Request(`http://localhost/api/instructor/questions/${questionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: { questionId } });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.updates = [];
  h.state.deletes = [];
  h.state.filters = [];
});

describe('PATCH /api/instructor/questions/[questionId]', () => {
  it('returns 401 without a token', async () => {
    const res = await call(validBody(), null);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await call(validBody(), 'bad-token');
    expect(res.status).toBe(401);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await call(validBody());
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('question');
  });

  it('returns 400 for invalid JSON', async () => {
    queueRole('instructor');
    const request = new Request('http://localhost/api/instructor/questions/q-1', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer valid-token' },
      body: '{not json',
    });
    const res = await PATCH(request, { params: { questionId: 'q-1' } });
    expect(res.status).toBe(400);
  });

  it('rejects a missing questionPrompt with 400', async () => {
    queueRole('instructor');
    const res = await call(validBody({ questionPrompt: '  ' }));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid activityType with 400', async () => {
    queueRole('instructor');
    const res = await call(validBody({ activityType: 'NOT_REAL' }));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid difficultyLevel with 400', async () => {
    queueRole('instructor');
    queueValidActivityType();
    const res = await call(validBody({ difficultyLevel: 9 }));
    expect(res.status).toBe(400);
  });

  it('rejects fewer than 2 answers with 400', async () => {
    queueRole('instructor');
    queueValidActivityType();
    const res = await call(validBody({ answers: [validAnswers()[0]] }));
    expect(res.status).toBe(400);
  });

  it('rejects an answer with no id with 400', async () => {
    queueRole('instructor');
    queueValidActivityType();
    const answers = [{ optionText: 'A', isCorrect: false }, { id: 'a-2', optionText: 'B', isCorrect: true }];
    const res = await call(validBody({ answers }));
    expect(res.status).toBe(400);
  });

  it('rejects duplicate answer ids with 400', async () => {
    queueRole('instructor');
    queueValidActivityType();
    const answers = [
      { id: 'a-1', optionText: 'A', isCorrect: false },
      { id: 'a-1', optionText: 'B', isCorrect: true },
    ];
    const res = await call(validBody({ answers }));
    expect(res.status).toBe(400);
  });

  it('rejects zero correct answers with 400', async () => {
    queueRole('instructor');
    queueValidActivityType();
    const answers = validAnswers().map((a) => ({ ...a, isCorrect: false }));
    const res = await call(validBody({ answers }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('Exactly one answer must be correct.');
  });

  it('rejects two correct answers with 400', async () => {
    queueRole('instructor');
    queueValidActivityType();
    const answers = validAnswers().map((a) => ({ ...a, isCorrect: true }));
    const res = await call(validBody({ answers }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('Exactly one answer must be correct.');
  });

  it('returns 404 when the question does not exist', async () => {
    queueRole('instructor');
    queueValidActivityType();
    queue('question', { data: null, error: null });

    const res = await call(validBody());
    expect(res.status).toBe(404);
  });

  it('returns 403 with a JSON body when the caller does not own the question', async () => {
    queueRole('instructor');
    queueValidActivityType();
    queueOwnedQuestion('some-other-instructor');

    const res = await call(validBody());
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error).toBe('You do not own this question.');
  });

  it('returns 400 when the answer count does not match the existing option count', async () => {
    queueRole('instructor');
    queueValidActivityType();
    queueOwnedQuestion();
    queueExistingLinks(['a-1']); // only one existing option, body sends two

    const res = await call(validBody());
    expect(res.status).toBe(400);
  });

  it('returns 400 when an answer id does not belong to this question', async () => {
    queueRole('instructor');
    queueValidActivityType();
    queueOwnedQuestion();
    queueExistingLinks(['a-1', 'a-3']); // body references a-2, which isn't linked here

    const res = await call(validBody());
    expect(res.status).toBe(400);
  });

  it('updates the question and its answers, leaving order_number/max_score/user_id untouched', async () => {
    queueRole('instructor');
    queueValidActivityType();
    queueOwnedQuestion();
    queueExistingLinks();
    queue('question', { data: null, error: null }); // question update
    queue('answer', { data: null, error: null }); // answer a-1 update
    queue('answer', { data: null, error: null }); // answer a-2 update

    const res = await call(validBody());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ questionId: 'q-1', answerIds: ['a-1', 'a-2'] });

    const questionUpdate = h.state.updates.find((u) => u.table === 'question');
    expect(questionUpdate?.payload).toEqual({
      question_prompt: 'Updated prompt?',
      activity_type: 'IDENTIFY_WEAK_USER_STORIES',
      difficulty_level: 2,
    });

    const answerUpdates = h.state.updates.filter((u) => u.table === 'answer');
    expect(answerUpdates[0].payload).toEqual({ option_text: 'Wrong updated', is_correct: false });
    expect(answerUpdates[1].payload).toEqual({
      option_text: 'Right updated',
      is_correct: true,
      explanation: 'Because reasons.',
    });
  });

  it('does not roll back a partial failure: an answer update failing after the question update succeeds is a plain 500', async () => {
    queueRole('instructor');
    queueValidActivityType();
    queueOwnedQuestion();
    queueExistingLinks();
    queue('question', { data: null, error: null }); // question update succeeds
    queue('answer', { data: null, error: null }); // answer a-1 update succeeds
    queue('answer', { data: null, error: { message: 'answer update failed' } }); // answer a-2 update fails

    const res = await call(validBody());
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('answer update failed');
    expect(h.state.deletes).toHaveLength(0);
  });
});
