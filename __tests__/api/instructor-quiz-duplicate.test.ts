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
      limit: () => builder,
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

import { POST } from '../../app/api/instructor/quizzes/[activityType]/duplicate/route';

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

function sourceDetailRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    description: null,
    grading_kind: 'mcq',
    rating_prompt: null,
    ...overrides,
  };
}

function postRequest(body: unknown, activityType = 'IDENTIFY_WEAK_USER_STORIES', token: string | null = 'valid-token') {
  return POST(
    new Request(`http://localhost/api/instructor/quizzes/${activityType}/duplicate`, {
      method: 'POST',
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
  h.state.inserts = [];
  h.state.deletes = [];
});

describe('POST /api/instructor/quizzes/[activityType]/duplicate', () => {
  it('returns 401 without a token', async () => {
    const res = await postRequest({ name: 'My Copy' }, 'IDENTIFY_WEAK_USER_STORIES', null);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await postRequest({ name: 'My Copy' });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 404 when the source catalog does not exist', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: null }); // getQuizByActivityType

    const res = await postRequest({ name: 'My Copy' }, 'NOT_REAL');
    expect(res.status).toBe(404);
    expect(h.state.inserts).toEqual([]);
  });

  it("returns 403 with an empty body when the source catalog belongs to a different instructor (not built-in, not the caller's)", async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ activity_type: 'MY_CUSTOM_QUIZ', creator_id: 'instructor-2' }), error: null });

    const res = await postRequest({ name: 'My Copy' }, 'MY_CUSTOM_QUIZ');
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 400 for a blank name', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null }); // built-in, so visible

    const res = await postRequest({ name: '   ' });
    expect(res.status).toBe(400);
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 400 when the derived key is empty (a name with no letters or digits)', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });

    const res = await postRequest({ name: '!!!' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least one letter or number/);
    expect(h.state.inserts).toEqual([]);
  });

  it('duplicates a built-in mcq catalog: new activity_type row, questions, answers, and links, all owned by the caller', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null }); // getQuizByActivityType (route's own visibility check)
    queue('activity_type', { data: sourceDetailRow(), error: null }); // duplicateCatalog's own read
    queue('activity_type', { data: null, error: null }); // insert new activity_type row
    queue('question', {
      data: [
        {
          question_prompt: 'Which story is weakest?',
          difficulty_level: 1,
          order_number: 1,
          max_score: 10,
          question_to_answer: [
            { answer: { option_text: 'Wrong', is_correct: false, explanation: null } },
            { answer: { option_text: 'Right', is_correct: true, explanation: 'Because.' } },
          ],
        },
      ],
      error: null,
    }); // source questions
    queue('question', { data: null, error: null }); // question insert
    queue('answer', { data: null, error: null }); // answer insert
    queue('question_to_answer', { data: null, error: null }); // link insert

    const res = await postRequest({ name: 'My Copy of Weak Stories' });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.quiz).toEqual({
      activityType: 'MY_COPY_OF_WEAK_STORIES',
      name: 'My Copy of Weak Stories',
      description: null,
      gradingKind: 'mcq',
      ratingPrompt: null,
      questionCount: 1,
    });

    const catalogInsert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect(catalogInsert?.payload).toMatchObject({
      activity_type: 'MY_COPY_OF_WEAK_STORIES',
      quiz_name: 'My Copy of Weak Stories',
      grading_kind: 'mcq',
      creator_id: 'instructor-1',
    });

    const questionInsert = h.state.inserts.find((i) => i.table === 'question');
    expect(questionInsert?.payload).toEqual([
      expect.objectContaining({
        question_prompt: 'Which story is weakest?',
        activity_type: 'MY_COPY_OF_WEAK_STORIES',
        difficulty_level: 1,
        order_number: 1,
        max_score: 10,
        user_id: 'instructor-1',
      }),
    ]);

    const answerInsert = h.state.inserts.find((i) => i.table === 'answer');
    expect(answerInsert?.payload).toEqual([
      expect.objectContaining({ option_text: 'Wrong', is_correct: false, explanation: null }),
      expect.objectContaining({ option_text: 'Right', is_correct: true, explanation: 'Because.' }),
    ]);

    const linkInsert = h.state.inserts.find((i) => i.table === 'question_to_answer');
    expect(linkInsert?.payload).toEqual([
      { question_id: expect.any(String), answer_id: expect.any(String) },
      { question_id: expect.any(String), answer_id: expect.any(String) },
    ]);
  });

  it('duplicates a built-in llm-graded catalog: new activity_type row plus every user_story, owned by the caller', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ activity_type: 'WRITE_ACCEPTANCE_CRITERIA', grading_kind: 'llm-graded' }), error: null });
    queue('instructor_llm_config', { data: { instructor_llm_config_id: 'config-1' }, error: null });
    queue('activity_type', { data: sourceDetailRow({ grading_kind: 'llm-graded' }), error: null });
    queue('activity_type', { data: null, error: null }); // insert
    queue('user_story', {
      data: [{ story_text: 'As a shopper, I want a cart.', difficulty_level: 1 }],
      error: null,
    });
    queue('user_story', { data: null, error: null }); // insert

    const res = await postRequest({ name: 'My AC Copy' }, 'WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.quiz).toMatchObject({ gradingKind: 'llm-graded', questionCount: 1 });

    const storyInsert = h.state.inserts.find((i) => i.table === 'user_story');
    expect(storyInsert?.payload).toEqual([
      expect.objectContaining({
        story_text: 'As a shopper, I want a cart.',
        difficulty_level: 1,
        activity_type: 'MY_AC_COPY',
        creator_id: 'instructor-1',
      }),
    ]);

    expect(h.state.tables).not.toContain('question');
  });

  // GitHub #520: duplicating an llm-graded catalog (most commonly the built-in
  // WRITE_ACCEPTANCE_CRITERIA example) hands the caller a brand-new catalog they own — its prompts
  // would be just as permanently ungradeable as a freshly created llm-graded catalog with no
  // provider configured.
  it('returns 400 when duplicating an llm-graded catalog and the instructor has no LLM config, without creating anything', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ activity_type: 'WRITE_ACCEPTANCE_CRITERIA', grading_kind: 'llm-graded' }), error: null });
    queue('instructor_llm_config', { data: null, error: null });

    const res = await postRequest({ name: 'My AC Copy' }, 'WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/configure an llm provider/i);
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 500 when the LLM config existence check fails during duplication', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ activity_type: 'WRITE_ACCEPTANCE_CRITERIA', grading_kind: 'llm-graded' }), error: null });
    queue('instructor_llm_config', { data: null, error: { message: 'DB down' } });

    const res = await postRequest({ name: 'My AC Copy' }, 'WRITE_ACCEPTANCE_CRITERIA');
    expect(res.status).toBe(500);
  });

  it('does not check for an LLM config when duplicating an mcq catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('activity_type', { data: sourceDetailRow(), error: null });
    queue('activity_type', { data: null, error: null });
    queue('question', { data: [], error: null });

    const res = await postRequest({ name: 'My Copy' });
    expect(res.status).toBe(201);
    expect(h.state.tables).not.toContain('instructor_llm_config');
  });

  it('lets an instructor duplicate their own (non-built-in) catalog too', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ activity_type: 'MY_CUSTOM_QUIZ', creator_id: 'instructor-1' }), error: null });
    queue('activity_type', { data: sourceDetailRow(), error: null });
    queue('activity_type', { data: null, error: null });
    queue('question', { data: [], error: null });

    const res = await postRequest({ name: 'Second Copy' }, 'MY_CUSTOM_QUIZ');
    expect(res.status).toBe(201);
  });

  it('returns 409 when the derived key collides with an existing catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('activity_type', { data: sourceDetailRow(), error: null });
    queue('activity_type', { data: null, error: { code: '23505', message: 'duplicate key' } }); // insert collides

    const res = await postRequest({ name: 'Identify Weak User Stories' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/);
  });

  it('rolls back the new catalog when copying its questions fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('activity_type', { data: sourceDetailRow(), error: null });
    queue('activity_type', { data: null, error: null }); // insert succeeds
    queue('question', { data: null, error: { message: 'DB failure' } }); // source read fails

    const res = await postRequest({ name: 'My Copy' });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('DB failure');

    expect(h.state.deletes).toContainEqual({ table: 'activity_type', column: 'activity_type', value: 'MY_COPY' });
  });
});
