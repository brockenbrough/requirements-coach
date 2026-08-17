import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    orders: [] as { table: string; column: string; ascending: boolean }[],
    filters: [] as { table: string; column: string; value: unknown }[],
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

import { GET } from '../../app/api/instructor/quizzes/[activityType]/route';

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

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.orders = [];
  h.state.filters = [];
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

  it('returns the catalog metadata and every question in it, any author, ordered by level then order_number', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
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
      authorName: 'Built-in',
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

  it("reports the creating instructor's name instead of 'Built-in' when creator_id is set", async () => {
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
    queue('question', { data: [], error: null });

    const res = await req('MY_CUSTOM_QUIZ');
    const body = await res.json();
    expect(body.quiz.authorName).toBe('Ada Brockenbrough');
    expect(body.questions).toEqual([]);
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
    queue('activity_type', { data: quizRow(), error: null });
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
    queue('activity_type', { data: quizRow({ grading_kind: 'llm-graded' }), error: null });
    queue('user_story', { data: null, error: { message: 'DB down' } });

    const res = await req('WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
