import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    orders: [] as { table: string; column: string; ascending: boolean }[],
    filters: [] as { table: string; column: string; value: unknown }[],
    deletes: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    let isDelete = false;

    const builder: Record<string, unknown> = {
      select: () => builder,
      delete: () => {
        isDelete = true;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        (isDelete ? state.deletes : state.filters).push({ table, column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        (isDelete ? state.deletes : state.filters).push({ table, column, value });
        return builder;
      },
      limit: () => builder,
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

import { DELETE, GET } from '../../app/api/instructor/quizzes/[activityType]/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function quizRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    quiz_name: 'Identify Weak User Stories',
    description: null,
    grading_kind: 'mcq',
    creator_id: null,
    creator: null,
    ...overrides,
  };
}

function questionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    question_id: 'q-1',
    question_prompt: 'Which story is weakest?',
    difficulty_level: 1,
    user_id: 'instructor-1',
    question_to_answer: [
      { answer: { answer_id: 'a-1', option_text: 'Wrong option', is_correct: false, explanation: 'Incorrect: not this one.' } },
      { answer: { answer_id: 'a-2', option_text: 'Right option', is_correct: true, explanation: 'Correct: this is the weakest one.' } },
    ],
    ...overrides,
  };
}

function req(activityType = 'IDENTIFY_WEAK_USER_STORIES', token: string | null = 'valid-token') {
  return GET(new Request(`http://localhost/api/instructor/quizzes/${activityType}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }), {
    params: { activityType },
  });
}

function delReq(activityType = 'IDENTIFY_WEAK_USER_STORIES', token: string | null = 'valid-token') {
  return DELETE(
    new Request(`http://localhost/api/instructor/quizzes/${activityType}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} }),
    { params: { activityType } },
  );
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.orders = [];
  h.state.filters = [];
  h.state.deletes = [];
});

describe('GET /api/instructor/quizzes/[activityType]', () => {
  it('returns 401 without a token', async () => {
    const res = await req('IDENTIFY_WEAK_USER_STORIES', null);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await req();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('returns 404 when the activity type matches no catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: null });

    const res = await req('NOT_REAL');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Catalog not found.');
    expect(h.state.tables).not.toContain('question');
  });

  it('returns the catalog metadata and every question in it, any question author, ordered by level then order_number', async () => {
    queueRole('instructor');
    queue('activity_type', {
      data: quizRow({
        creator_id: 'instructor-1',
        creator: { first_name: 'Ada', last_name: 'Brockenbrough', username: 'abrock' },
      }),
      error: null,
    });
    queue('question', {
      data: [
        questionRow(),
        questionRow({ question_id: 'q-2', user_id: null, difficulty_level: 2 }), // built-in, unowned
      ],
      error: null,
    });

    const res = await req();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.quiz).toEqual({
      activityType: 'IDENTIFY_WEAK_USER_STORIES',
      name: 'Identify Weak User Stories',
      description: null,
      authorName: 'Ada Brockenbrough',
      gradingKind: 'mcq',
    });

    expect(body.questions).toHaveLength(2);
    expect(body.questions[0]).toEqual({
      id: 'q-1',
      quizType: 'IDENTIFY_WEAK_USER_STORIES',
      level: 1,
      questionText: 'Which story is weakest?',
      answerOptions: [
        { id: 'a-1', text: 'Wrong option', isCorrect: false },
        { id: 'a-2', text: 'Right option', isCorrect: true },
      ],
      explanation: 'Correct: this is the weakest one.',
      ownerId: 'instructor-1',
    });
    expect(body.questions[1].ownerId).toBeNull();

    expect(h.state.orders).toContainEqual({ table: 'question', column: 'difficulty_level', ascending: true });
    expect(h.state.orders).toContainEqual({ table: 'question', column: 'order_number', ascending: true });
    expect(h.state.filters).toContainEqual({ table: 'question', column: 'activity_type', value: 'IDENTIFY_WEAK_USER_STORIES' });
  });

  it('returns 403 with an empty body when the catalog was created by another instructor', async () => {
    queueRole('instructor');
    queue('activity_type', {
      data: quizRow({
        activity_type: 'MY_CUSTOM_QUIZ',
        quiz_name: 'My Custom Quiz',
        creator_id: 'instructor-2',
        creator: { first_name: 'Ada', last_name: 'Brockenbrough', username: 'abrock' },
      }),
      error: null,
    });

    const res = await req('MY_CUSTOM_QUIZ');
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('question');
  });

  it('returns 403 with an empty body for a built-in catalog (creator_id is null)', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null }); // default creator_id: null

    const res = await req();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('question');
    expect(h.state.tables).not.toContain('user_story');
  });

  it('returns 500 when the catalog lookup fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: { message: 'DB down' } });

    const res = await req();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });

  it('returns 500 when the question query fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-1' }), error: null });
    queue('question', { data: null, error: { message: 'question query failed' } });

    const res = await req();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('question query failed');
  });
});

// GitHub #379: an llm-graded catalog returns its prompts instead of questions. Both keys are
// always present so the client reads quiz.gradingKind rather than narrowing the response shape.
describe('GET /api/instructor/quizzes/[activityType] — llm-graded catalogs', () => {
  it('returns the prompts and an empty questions array, without querying question', async () => {
    queueRole('instructor');
    queue('activity_type', {
      data: quizRow({
        activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
        quiz_name: 'Write Acceptance Criteria',
        grading_kind: 'llm-graded',
        creator_id: 'instructor-1',
      }),
      error: null,
    });
    queue('user_story', {
      data: [
        { user_story_id: 'story-1', story_text: 'As a shopper, I want a cart.', difficulty_level: 1, creator_id: 'instructor-1' },
        { user_story_id: 'story-2', story_text: 'As a rider, I want an ETA.', difficulty_level: 2, creator_id: null },
      ],
      error: null,
    });

    const res = await req('WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.quiz.gradingKind).toBe('llm-graded');
    expect(body.questions).toEqual([]);
    expect(body.userStories).toEqual([
      {
        id: 'story-1',
        activityType: 'WRITE_ACCEPTANCE_CRITERIA',
        level: 1,
        storyText: 'As a shopper, I want a cart.',
        ownerId: 'instructor-1',
      },
      {
        id: 'story-2',
        activityType: 'WRITE_ACCEPTANCE_CRITERIA',
        level: 2,
        storyText: 'As a rider, I want an ETA.',
        ownerId: null,
      },
    ]);

    expect(h.state.tables).not.toContain('question');
  });

  it('returns 500 when the prompt query fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });
    queue('user_story', { data: null, error: { message: 'DB down' } });

    const res = await req('WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});

describe('DELETE /api/instructor/quizzes/[activityType]', () => {
  it('returns 401 without a token', async () => {
    const res = await delReq('IDENTIFY_WEAK_USER_STORIES', null);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await delReq();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('returns 404 when the activity type matches no catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: null });

    const res = await delReq('NOT_REAL');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Catalog not found.');
    expect(h.state.tables).not.toContain('session_log');
  });

  it('returns 403 with an empty body when the catalog was created by another instructor', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-2' }), error: null });

    const res = await delReq();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('session_log');
  });

  it('returns 403 with an empty body for a built-in catalog (creator_id is null)', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null }); // default creator_id: null

    const res = await delReq();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('session_log');
  });

  it('returns 409 and deletes nothing when a student has already started a session for this catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-1' }), error: null });
    queue('session_log', { data: { session_id: 'session-1' }, error: null });

    const res = await delReq();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('This catalog has already been used by a student and cannot be deleted.');
    expect(h.state.tables).not.toContain('question');
    expect(h.state.deletes).toEqual([]);
  });

  // daily_challenge_attempt has no session_log/activity_type of its own, so a question can be
  // "in use" there even with zero session_log rows for the catalog — the check this test locks in.
  it('returns 409 when an mcq catalog\'s question has a daily_challenge_attempt, even with no session_log rows', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-1' }), error: null });
    queue('session_log', { data: null, error: null });
    queue('question', { data: [{ question_id: 'q-1' }], error: null });
    queue('daily_challenge_attempt', { data: { daily_challenge_attempt_id: 'attempt-1' }, error: null });

    const res = await delReq();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('This catalog has already been used by a student and cannot be deleted.');
    expect(h.state.deletes).toEqual([]);
  });

  it('deletes an unused mcq catalog\'s questions/answers, unlinks it from every quiz, and deletes the catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-1' }), error: null }); // getQuizByActivityType
    queue('session_log', { data: null, error: null });
    queue('question', { data: [{ question_id: 'q-1' }, { question_id: 'q-2' }], error: null }); // select ids
    queue('daily_challenge_attempt', { data: null, error: null });
    queue('question_to_answer', { data: [{ answer_id: 'a-1' }, { answer_id: 'a-2' }], error: null }); // select answer ids
    queue('question_to_answer', { data: null, error: null }); // delete
    queue('answer', { data: null, error: null }); // delete
    queue('question', { data: null, error: null }); // delete
    queue('title_definition', { data: null, error: null }); // delete
    queue('assembled_quiz_catalog', { data: null, error: null }); // delete
    queue('activity_type', { data: null, error: null }); // delete

    const res = await delReq();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ activityType: 'IDENTIFY_WEAK_USER_STORIES' });

    expect(h.state.deletes).toContainEqual({ table: 'question_to_answer', column: 'question_id', value: ['q-1', 'q-2'] });
    expect(h.state.deletes).toContainEqual({ table: 'answer', column: 'answer_id', value: ['a-1', 'a-2'] });
    expect(h.state.deletes).toContainEqual({ table: 'question', column: 'question_id', value: ['q-1', 'q-2'] });
    expect(h.state.deletes).toContainEqual({ table: 'title_definition', column: 'activity_type', value: 'IDENTIFY_WEAK_USER_STORIES' });
    expect(h.state.deletes).toContainEqual({ table: 'assembled_quiz_catalog', column: 'activity_type', value: 'IDENTIFY_WEAK_USER_STORIES' });
    expect(h.state.deletes).toContainEqual({ table: 'activity_type', column: 'activity_type', value: 'IDENTIFY_WEAK_USER_STORIES' });
  });

  it('deletes an unused llm-graded catalog\'s prompts, unlinks it from every quiz, and deletes the catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });
    queue('session_log', { data: null, error: null });
    queue('user_story', { data: null, error: null }); // delete
    queue('title_definition', { data: null, error: null });
    queue('assembled_quiz_catalog', { data: null, error: null });
    queue('activity_type', { data: null, error: null }); // delete

    const res = await delReq('WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(200);

    expect(h.state.deletes).toContainEqual({ table: 'user_story', column: 'activity_type', value: 'WRITE_ACCEPTANCE_CRITERIA' });
    expect(h.state.deletes).toContainEqual({ table: 'assembled_quiz_catalog', column: 'activity_type', value: 'WRITE_ACCEPTANCE_CRITERIA' });
    expect(h.state.tables).not.toContain('question');
    expect(h.state.tables).not.toContain('daily_challenge_attempt');
  });

  it('returns 500 when the final delete fails for a reason other than a foreign key violation', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });
    queue('session_log', { data: null, error: null });
    queue('user_story', { data: null, error: null });
    queue('title_definition', { data: null, error: null });
    queue('assembled_quiz_catalog', { data: null, error: null });
    queue('activity_type', { data: null, error: { message: 'DB down' } });

    const res = await delReq('WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });

  it('returns 409 (defense in depth) when the final delete hits a foreign key violation the earlier checks missed', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });
    queue('session_log', { data: null, error: null });
    queue('user_story', { data: null, error: null });
    queue('title_definition', { data: null, error: null });
    queue('assembled_quiz_catalog', { data: null, error: null });
    queue('activity_type', { data: null, error: { message: 'update or delete violates foreign key constraint', code: '23503' } });

    const res = await delReq('WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(409);
  });
});
