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
      is: () => builder,
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

import { POST } from '../../app/api/instructor/assembled-quizzes/[quizId]/user-stories/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function queueOwnedQuiz(overrides: Partial<Record<string, unknown>> = {}) {
  queue('assembled_quiz', {
    data: {
      assembled_quiz_id: 'quiz-1',
      quiz_name: 'Write Better Prompts',
      description: null,
      course_id: 'course-1',
      creator_id: 'instructor-1',
      grading_kind: 'llm-graded',
      created_at: '2026-08-14T10:00:00',
      ...overrides,
    },
    error: null,
  });
}

/** activity_type as getGradingKind's .select('grading_kind').maybeSingle() returns it. */
function queueGradingKind(gradingKind: string | null) {
  queue('activity_type', { data: gradingKind === null ? null : { grading_kind: gradingKind }, error: null });
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    storyText: 'As a shopper, I want to save my cart, so that I can return to it later.',
    activityType: 'WRITE_ACCEPTANCE_CRITERIA',
    difficultyLevel: 2,
    ...overrides,
  };
}

function postRequest(body: unknown, token: string | null = 'valid-token', quizId = 'quiz-1') {
  return POST(
    new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}/user-stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    { params: { quizId } },
  );
}

/** Queues every table hit by a full successful create-and-hand-pick, in call order. */
function queueFullSuccess(options: { summaryRow?: Result['data'] } = {}) {
  queueGradingKind('llm-graded'); // validateUserStoryInput's activity_type lookup
  queue('user_story', { data: null, error: null }); // user_story insert
  queue('assembled_quiz_extra_user_story', { data: null, error: null }); // hand-pick insert
  queue('user_story', { data: options.summaryRow ?? null, error: null }); // getExtraUserStorySummary read-back
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
  h.state.deletes = [];
});

describe('POST /api/instructor/assembled-quizzes/[quizId]/user-stories', () => {
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
    expect(h.state.tables).not.toContain('user_story');
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
    expect(h.state.tables).not.toContain('user_story');
  });

  it("returns 400 when this quiz's grading_kind isn't 'llm-graded'", async () => {
    queueRole('instructor');
    queueOwnedQuiz({ grading_kind: 'mcq' });

    const res = await postRequest(validBody());
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('This quiz can only include LLM-graded prompts.');
    expect(h.state.tables).not.toContain('user_story');
  });

  it('returns 400 for invalid JSON', async () => {
    queueRole('instructor');
    queueOwnedQuiz();

    const res = await POST(
      new Request('http://localhost/api/instructor/assembled-quizzes/quiz-1/user-stories', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: '{not json',
      }),
      { params: { quizId: 'quiz-1' } },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when storyText is missing or blank', async () => {
    queueRole('instructor');
    queueOwnedQuiz();

    const res = await postRequest(validBody({ storyText: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an activityType that matches no catalog, without inserting', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueGradingKind(null);

    const res = await postRequest(validBody({ activityType: 'NOPE' }));
    expect(res.status).toBe(400);
    expect(h.state.inserts).toEqual([]);
  });

  // Mirrors POST /api/instructor/user-stories' own equivalent test — the target catalog itself
  // must be llm-graded too, independent of this quiz's own kind check above.
  it('returns 400 when the target catalog is a multiple-choice quiz', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueGradingKind('mcq');

    const res = await postRequest(validBody());
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/LLM-graded/i);
    expect(h.state.inserts).toEqual([]);
  });

  it('creates the prompt in the chosen catalog AND hand-picks it onto this quiz in one request', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueFullSuccess({
      summaryRow: {
        user_story_id: 'whatever-the-real-id-is',
        story_text: 'As a shopper, I want to save my cart, so that I can return to it later.',
        difficulty_level: 2,
        activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
        catalog: { quiz_name: 'Write Acceptance Criteria' },
      },
    });

    const res = await postRequest(validBody());
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(typeof body.userStoryId).toBe('string');
    expect(body.extraUserStory).toMatchObject({
      storyText: 'As a shopper, I want to save my cart, so that I can return to it later.',
      level: 2,
      catalogActivityType: 'WRITE_ACCEPTANCE_CRITERIA',
      catalogName: 'Write Acceptance Criteria',
    });

    const storyInsert = h.state.inserts.find((i) => i.table === 'user_story');
    expect(storyInsert?.payload).toMatchObject({
      story_text: 'As a shopper, I want to save my cart, so that I can return to it later.',
      activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
      difficulty_level: 2,
      creator_id: 'instructor-1',
    });

    const pickInsert = h.state.inserts.find((i) => i.table === 'assembled_quiz_extra_user_story');
    expect(pickInsert?.payload).toMatchObject({ assembled_quiz_id: 'quiz-1' });
  });

  it('falls back to a summary built from the input when the read-back finds no row, without failing the request', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueFullSuccess(); // summaryRow omitted -> getExtraUserStorySummary returns { summary: null }

    const res = await postRequest(validBody());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.extraUserStory).toMatchObject({
      storyText: 'As a shopper, I want to save my cart, so that I can return to it later.',
      level: 2,
      catalogActivityType: 'WRITE_ACCEPTANCE_CRITERIA',
    });
  });

  it('rolls back the created prompt if hand-picking it onto the quiz fails', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueGradingKind('llm-graded');
    queue('user_story', { data: null, error: null }); // user_story insert succeeds
    queue('assembled_quiz_extra_user_story', { data: null, error: { message: 'DB down' } }); // hand-pick fails

    const res = await postRequest(validBody());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');

    const userStoryId = (h.state.inserts.find((i) => i.table === 'user_story')?.payload as { user_story_id: string })
      .user_story_id;
    expect(h.state.deletes).toContainEqual({ table: 'user_story', column: 'user_story_id', value: userStoryId });
  });

  it('returns 500 when the prompt insert itself fails', async () => {
    queueRole('instructor');
    queueOwnedQuiz();
    queueGradingKind('llm-graded');
    queue('user_story', { data: null, error: { message: 'insert failed' } });

    const res = await postRequest(validBody());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('insert failed');
    expect(h.state.tables).not.toContain('assembled_quiz_extra_user_story');
  });
});
