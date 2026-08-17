import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
    deletes: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    let isDelete = false;

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      delete: () => {
        isDelete = true;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        if (isDelete) state.deletes.push({ table, column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        if (isDelete) state.deletes.push({ table, column, value });
        return builder;
      },
      order: () => builder,
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

import { POST } from '../../app/api/instructor/assembled-quizzes/[quizId]/questions/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function queueOwnedQuiz(overrides: Partial<Record<string, unknown>> = {}) {
  queue('assembled_quiz', {
    data: {
      assembled_quiz_id: 'quiz-1',
      quiz_name: 'Sprint 1 Requirements Check',
      description: null,
      course_id: 'course-1',
      creator_id: 'instructor-1',
      created_at: '2026-08-14T10:00:00',
      ...overrides,
    },
    error: null,
  });
}

/** Queues a successful activity_type lookup (GitHub #347: isActivityType is now a DB read). */
function queueValidActivityType(activityType = 'IDENTIFY_WEAK_USER_STORIES') {
  queue('activity_type', { data: { activity_type: activityType }, error: null });
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

function postRequest(body: unknown, token: string | null = 'valid-token', quizId = 'quiz-1') {
  return POST(
    new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    { params: { quizId } },
  );
}

/** Queues every table hit by a full successful create-and-hand-pick, in call order. */
function queueFullSuccess(options: { summaryRow?: Result['data'] } = {}) {
  queueValidActivityType();
  queue('question', { data: null, error: null }); // MAX(order_number)
  queue('question', { data: null, error: null }); // question insert
  queue('answer', { data: null, error: null }); // answer 1 insert
  queue('question_to_answer', { data: null, error: null }); // link 1
  queue('answer', { data: null, error: null }); // answer 2 insert
  queue('question_to_answer', { data: null, error: null }); // link 2
  queue('assembled_quiz_extra_question', { data: null, error: null }); // hand-pick insert
  queue('question', { data: options.summaryRow ?? null, error: null }); // getExtraQuestionSummary read-back
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
  h.state.deletes = [];
});

describe('POST /api/instructor/assembled-quizzes/[quizId]/questions', () => {
  it('returns 401 without a token', async () => {
    const res = await postRequest(validBody(), null);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await postRequest(validBody());
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('question');
  });

  it('returns 404 when the quiz does not exist', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: null, error: null });

    const res = await postRequest(validBody());
    expect(res.status).toBe(404);
  });

  it('returns 403 with an empty body when the caller does not own the quiz', async () => {
    queueRole('instructor');
    queueOwnedQuiz({ creator_id: 'someone-else' });

    const res = await postRequest(validBody());
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('question');
  });

  it('returns 400 for invalid JSON', async () => {
    queueRole('instructor');
    queueOwnedQuiz();

    const res = await POST(
      new Request('http://localhost/api/instructor/assembled-quizzes/quiz-1/questions', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: '{not json',
      }),
      { params: { quizId: 'quiz-1' } },
    );
    expect(res.status).toBe(400);
  });

  it('rejects a missing questionPrompt with 400', async () => {
    queueRole('instructor');
    queueOwnedQuiz();

    const res = await postRequest(validBody({ questionPrompt: '  ' }));
    expect(res.status).toBe(400);
  });

  it('rejects an invalid activityType (catalog) with 400', async () => {
    queueRole('instructor');
    queueOwnedQuiz();

    const res = await postRequest(validBody({ activityType: 'NOT_REAL' }));
    expect(res.status).toBe(400);
  });

  it('rejects zero correct answers with 400', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueValidActivityType();

    const answers = validAnswers().map((a) => ({ ...a, isCorrect: false }));
    const res = await postRequest(validBody({ answers }));
    expect(res.status).toBe(400);
  });

  it(
    'creates the question in the chosen catalog AND hand-picks it onto this quiz in one request',
    async () => {
      queueRole('instructor');
      queueOwnedQuiz();
      queueFullSuccess({
        summaryRow: {
          question_id: 'whatever-the-real-id-is',
          question_prompt: 'Which story is weakest?',
          difficulty_level: 1,
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          catalog: { quiz_name: 'Identify Weak User Stories' },
        },
      });

      const res = await postRequest(validBody());
      expect(res.status).toBe(201);
      const body = await res.json();

      expect(typeof body.questionId).toBe('string');
      expect(body.answerIds).toHaveLength(2);
      expect(body.extraQuestion).toMatchObject({
        questionText: 'Which story is weakest?',
        level: 1,
        catalogActivityType: 'IDENTIFY_WEAK_USER_STORIES',
        catalogName: 'Identify Weak User Stories',
      });

      const questionInsert = h.state.inserts.find((i) => i.table === 'question');
      expect(questionInsert?.payload).toMatchObject({
        question_prompt: 'Which story is weakest?',
        activity_type: 'IDENTIFY_WEAK_USER_STORIES',
        difficulty_level: 1,
        order_number: 1,
        max_score: 10,
        user_id: 'instructor-1',
      });

      const pickInsert = h.state.inserts.find((i) => i.table === 'assembled_quiz_extra_question');
      expect(pickInsert?.payload).toMatchObject({ assembled_quiz_id: 'quiz-1' });
    },
  );

  it("does not require the chosen catalog to already be linked to the quiz — never touches assembled_quiz_catalog", async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueFullSuccess();

    const res = await postRequest(validBody());
    expect(res.status).toBe(201);
    expect(h.state.tables).not.toContain('assembled_quiz_catalog');
  });

  it('falls back to a summary built from the input when the read-back finds no row, without failing the request', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueFullSuccess(); // summaryRow omitted -> getExtraQuestionSummary returns { summary: null }

    const res = await postRequest(validBody());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.extraQuestion).toMatchObject({
      questionText: 'Which story is weakest?',
      level: 1,
      catalogActivityType: 'IDENTIFY_WEAK_USER_STORIES',
    });
  });

  it('rolls back the created question (and its answers) if hand-picking it onto the quiz fails', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueValidActivityType();
    queue('question', { data: null, error: null }); // MAX(order_number)
    queue('question', { data: null, error: null }); // question insert
    queue('answer', { data: null, error: null }); // answer 1 insert
    queue('question_to_answer', { data: null, error: null }); // link 1
    queue('answer', { data: null, error: null }); // answer 2 insert
    queue('question_to_answer', { data: null, error: null }); // link 2
    queue('assembled_quiz_extra_question', { data: null, error: { message: 'DB down' } }); // hand-pick fails

    const res = await postRequest(validBody());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');

    const questionId = (h.state.inserts.find((i) => i.table === 'question')?.payload as { question_id: string })
      .question_id;
    const answerIds = h.state.inserts
      .filter((i) => i.table === 'answer')
      .map((i) => (i.payload as { answer_id: string }).answer_id);

    expect(h.state.deletes).toContainEqual({ table: 'question_to_answer', column: 'question_id', value: questionId });
    expect(h.state.deletes).toContainEqual({ table: 'answer', column: 'answer_id', value: answerIds });
    expect(h.state.deletes).toContainEqual({ table: 'question', column: 'question_id', value: questionId });

    // The rollback never reaches the hand-pick link table with a delete — there was nothing to unpick.
    expect(h.state.deletes.some((d) => d.table === 'assembled_quiz_extra_question')).toBe(false);
  });

  it('rolls back the question if an answer insert fails partway through creation itself', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueValidActivityType();
    queue('question', { data: null, error: null }); // MAX(order_number)
    queue('question', { data: null, error: null }); // question insert
    queue('answer', { data: null, error: null }); // answer 1 insert succeeds
    queue('question_to_answer', { data: null, error: null }); // link 1 succeeds
    queue('answer', { data: null, error: { message: 'answer insert failed' } }); // answer 2 fails

    const res = await postRequest(validBody());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('answer insert failed');
    expect(h.state.tables).not.toContain('assembled_quiz_extra_question');
  });
});
