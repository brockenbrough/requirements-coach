import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    orders: [] as { table: string; column: string; ascending: boolean }[],
    filters: [] as { table: string; column: string; value: unknown }[],
    deletes: [] as { table: string; column: string; value: unknown }[],
    updates: [] as { table: string; payload: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    let isDelete = false;

    const builder: Record<string, unknown> = {
      select: () => builder,
      delete: () => {
        isDelete = true;
        return builder;
      },
      update: (payload: unknown) => {
        state.updates.push({ table, payload });
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
      is: () => builder,
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

import { DELETE, GET, PATCH } from '../../app/api/instructor/quizzes/[activityType]/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function quizRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    quiz_name: 'Identify Weak User Stories',
    description: null,
    grading_kind: 'mcq',
    rating_prompt: null,
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

function patchReq(body: unknown, activityType = 'IDENTIFY_WEAK_USER_STORIES', token: string | null = 'valid-token') {
  return PATCH(
    new Request(`http://localhost/api/instructor/quizzes/${activityType}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: { activityType } },
  );
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.orders = [];
  h.state.filters = [];
  h.state.deletes = [];
  h.state.updates = [];
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
      ratingPrompt: null,
      isBuiltIn: false,
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

  // GitHub #478: a built-in example catalog is visible (read-only) to every instructor, not just
  // whoever created it — there is no creator to match anyway, since creator_id is NULL.
  it('returns 200 with isBuiltIn: true for a built-in catalog (creator_id is null)', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null }); // default creator_id: null
    queue('question', { data: [questionRow({ user_id: null })], error: null });

    const res = await req();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quiz.isBuiltIn).toBe(true);
    expect(body.questions[0].ownerId).toBeNull();
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

describe('PATCH /api/instructor/quizzes/[activityType]', () => {
  it('returns 401 without a token', async () => {
    const res = await patchReq({ ratingPrompt: 'New rubric.' }, 'IDENTIFY_WEAK_USER_STORIES', null);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await patchReq({ ratingPrompt: 'New rubric.' });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('returns 404 when the activity type matches no catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: null });

    const res = await patchReq({ ratingPrompt: 'New rubric.' }, 'NOT_REAL');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Catalog not found.');
    expect(h.state.updates).toEqual([]);
  });

  it('returns 403 with an empty body when the catalog was created by another instructor', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-2' }), error: null });

    const res = await patchReq({ ratingPrompt: 'New rubric.' });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.updates).toEqual([]);
  });

  it('returns 400 when the catalog is mcq (no rubric to set)', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-1' }), error: null });

    const res = await patchReq({ ratingPrompt: 'New rubric.' });
    expect(res.status).toBe(400);
    expect(h.state.updates).toEqual([]);
  });

  it('returns 400 when ratingPrompt is missing', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });

    const res = await patchReq({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ratingPrompt/);
    expect(h.state.updates).toEqual([]);
  });

  it('returns 400 when ratingPrompt is blank', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });

    const res = await patchReq({ ratingPrompt: '   ' });
    expect(res.status).toBe(400);
    expect(h.state.updates).toEqual([]);
  });

  it('returns 400 when ratingPrompt exceeds the length cap', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });

    const res = await patchReq({ ratingPrompt: 'A'.repeat(4001) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/4000/);
    expect(h.state.updates).toEqual([]);
  });

  it('trims ratingPrompt and saves it, returning the saved value', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });
    queue('activity_type', { data: { rating_prompt: 'Trimmed rubric.' }, error: null }); // update

    const res = await patchReq({ ratingPrompt: '  Trimmed rubric.  ' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ratingPrompt: 'Trimmed rubric.' });

    expect(h.state.updates).toContainEqual({ table: 'activity_type', payload: { rating_prompt: 'Trimmed rubric.' } });
  });

  it('returns 500 when the update fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });
    queue('activity_type', { data: null, error: { message: 'DB down' } }); // update

    const res = await patchReq({ ratingPrompt: 'New rubric.' });
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

  // GitHub #525: deletion no longer checks session_log/daily_challenge_attempt at all — a
  // catalog stays deletable regardless of how many students have already attempted it.
  it('succeeds even when a student has already completed a session for this catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-1' }), error: null }); // getQuizByActivityType
    queue('assembled_quiz_catalog', { data: [], error: null }); // linkage check — no quiz links
    queue('activity_type', { data: null, error: null }); // the soft-delete UPDATE

    const res = await delReq();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ activityType: 'IDENTIFY_WEAK_USER_STORIES' });

    expect(h.state.tables).not.toContain('session_log');
    expect(h.state.tables).not.toContain('daily_challenge_attempt');
    expect(h.state.tables).not.toContain('question');
    expect(h.state.deletes).toEqual([]); // nothing is ever hard-deleted any more
    expect(h.state.updates).toContainEqual({
      table: 'activity_type',
      payload: { deleted_at: expect.any(String) },
    });
  });

  it('returns 409 and deletes nothing when the catalog is still composed into one or more assembled quizzes', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-1' }), error: null });
    queue('assembled_quiz_catalog', {
      data: [
        { assembled_quiz: { assembled_quiz_id: 'quiz-1', quiz_name: 'Sprint 1 Quiz', course: { course_name: 'CS 101' } } },
        { assembled_quiz: { assembled_quiz_id: 'quiz-2', quiz_name: 'Midterm Review', course: { course_name: 'CS 201' } } },
      ],
      error: null,
    });

    const res = await delReq();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('"Sprint 1 Quiz" (CS 101)');
    expect(body.error).toContain('"Midterm Review" (CS 201)');
    expect(body.quizzes).toEqual([
      { quizId: 'quiz-1', quizName: 'Sprint 1 Quiz', courseName: 'CS 101' },
      { quizId: 'quiz-2', quizName: 'Midterm Review', courseName: 'CS 201' },
    ]);
    expect(h.state.updates).toEqual([]);
  });

  it('soft-deletes an mcq catalog: one activity_type update, nothing else touched', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-1' }), error: null }); // getQuizByActivityType
    queue('assembled_quiz_catalog', { data: [], error: null }); // linkage check — no quiz links
    queue('activity_type', { data: null, error: null }); // the soft-delete UPDATE

    const res = await delReq();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ activityType: 'IDENTIFY_WEAK_USER_STORIES' });

    expect(h.state.updates).toEqual([
      { table: 'activity_type', payload: { deleted_at: expect.any(String) } },
    ]);
    expect(h.state.tables).not.toContain('question');
    expect(h.state.tables).not.toContain('user_story');
    expect(h.state.tables).not.toContain('title_definition');
  });

  it('soft-deletes an llm-graded catalog the same way as mcq', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });
    queue('assembled_quiz_catalog', { data: [], error: null }); // linkage check — no quiz links
    queue('activity_type', { data: null, error: null }); // the soft-delete UPDATE

    const res = await delReq('WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(200);

    expect(h.state.updates).toEqual([
      { table: 'activity_type', payload: { deleted_at: expect.any(String) } },
    ]);
    expect(h.state.tables).not.toContain('question');
    expect(h.state.tables).not.toContain('user_story');
    expect(h.state.tables).not.toContain('daily_challenge_attempt');
  });

  it('returns 500 when the soft-delete update fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded', creator_id: 'instructor-1' }), error: null });
    queue('assembled_quiz_catalog', { data: [], error: null }); // linkage check — no quiz links
    queue('activity_type', { data: null, error: { message: 'DB down' } }); // the soft-delete UPDATE

    const res = await delReq('WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
