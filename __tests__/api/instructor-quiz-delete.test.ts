import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Harness from __tests__/api/instructor-quiz-detail.test.ts plus delete/limit — deleting a catalog
// unwinds its questions before removing the row itself.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    deletes: [] as { table: string; filters: { column: string; value: unknown }[] }[],
  };

  function makeBuilder(table: string, result: Result) {
    const filters: { column: string; value: unknown }[] = [];

    const builder: Record<string, unknown> = {
      select: () => builder,
      delete: () => {
        state.deletes.push({ table, filters });
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        filters.push({ column, value });
        return builder;
      },
      limit: () => builder,
      order: () => builder,
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

import { DELETE } from '../../app/api/instructor/quizzes/[activityType]/route';

const ACTIVITY_TYPE = 'MY_CATALOG';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function quizRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: ACTIVITY_TYPE,
    quiz_name: 'My Catalog',
    description: null,
    grading_kind: 'mcq',
    creator_id: 'instructor-1',
    creator: null,
    ...overrides,
  };
}

function questionRow(questionId: string, answerIds: string[]) {
  return {
    question_id: questionId,
    question_prompt: 'Which story is weakest?',
    difficulty_level: 1,
    user_id: 'instructor-1',
    question_to_answer: answerIds.map((answerId) => ({
      answer: { answer_id: answerId, option_text: 'An option', is_correct: false, explanation: null },
    })),
  };
}

/** The happy path's queue: owned catalog, no sessions, no quiz links. */
function queueDeletable(overrides: { quiz?: Record<string, unknown> } = {}) {
  queueRole('instructor');
  queue('activity_type', { data: quizRow(overrides.quiz), error: null });
  queue('session_log', { data: [], error: null });
  queue('assembled_quiz_catalog', { data: [], error: null });
}

function req(token: string | null = 'valid-token') {
  return DELETE(
    new Request(`http://localhost/api/instructor/quizzes/${ACTIVITY_TYPE}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: { activityType: ACTIVITY_TYPE } },
  );
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.deletes = [];
});

describe('DELETE /api/instructor/quizzes/{activityType}', () => {
  it('returns 401 without a token', async () => {
    expect((await req(null)).status).toBe(401);
  });

  it('returns a bodyless 403 for a student', async () => {
    queueRole('student');
    const res = await req();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 404 for an unknown catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: null });

    const res = await req();

    expect(res.status).toBe(404);
    expect(h.state.deletes).toHaveLength(0);
  });

  it('returns a bodyless 403 for a catalog owned by someone else', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-2' }), error: null });

    const res = await req();

    expect(res.status).toBe(403);
    expect(h.state.deletes).toHaveLength(0);
  });

  // The load-bearing rule: score, titles and streaks are all derived from session_log, so removing
  // attempt history would silently take away points and titles students earned.
  it('refuses with 409 when students have already worked on the catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('session_log', { data: [{ session_id: 's-1' }], error: null });

    const res = await req();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('already worked on this catalog');
    expect(h.state.deletes).toHaveLength(0);
  });

  it('refuses with 409 when the catalog is composed into an assembled quiz', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('session_log', { data: [], error: null });
    queue('assembled_quiz_catalog', { data: [{ assembled_quiz_id: 'aq-1' }], error: null });

    const res = await req();

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('1 assembled quiz');
    expect(h.state.deletes).toHaveLength(0);
  });

  it('pluralises the assembled-quiz refusal', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('session_log', { data: [], error: null });
    queue('assembled_quiz_catalog', { data: [{ assembled_quiz_id: 'aq-1' }, { assembled_quiz_id: 'aq-2' }], error: null });

    const res = await req();

    expect((await res.json()).error).toContain('2 assembled quizzes');
  });

  it('deletes an MCQ catalog: answers and links first, then the questions, then the catalog', async () => {
    queueDeletable();
    queue('question', { data: [questionRow('q-1', ['a-1', 'a-2'])], error: null });

    const res = await req();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ activityType: ACTIVITY_TYPE, deletedQuestions: 1, deletedPrompts: 0 });
    expect(h.state.deletes.map((entry) => entry.table)).toEqual([
      'question_to_answer',
      'answer',
      'question',
      'activity_type',
    ]);
  });

  it('deletes an llm-graded catalog by clearing its prompts', async () => {
    queueDeletable({ quiz: { grading_kind: 'llm-graded' } });
    queue('user_story', { data: [{ user_story_id: 'us-1', story_text: 'A story', difficulty_level: 1, creator_id: 'instructor-1' }], error: null });

    const res = await req();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ activityType: ACTIVITY_TYPE, deletedQuestions: 0, deletedPrompts: 1 });
    expect(h.state.deletes.map((entry) => entry.table)).toEqual(['user_story', 'activity_type']);
  });

  // fk_title_definition_activity_type is ON DELETE CASCADE, so the ladder needs no explicit delete
  // — and "user".selected_title_definition_id being ON DELETE SET NULL un-wears it for free.
  it('never deletes title_definition rows itself — the cascade handles them', async () => {
    queueDeletable();
    queue('question', { data: [], error: null });

    await req();

    expect(h.state.deletes.map((entry) => entry.table)).not.toContain('title_definition');
  });

  it('deletes an empty catalog', async () => {
    queueDeletable();
    queue('question', { data: [], error: null });

    const res = await req();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ activityType: ACTIVITY_TYPE, deletedQuestions: 0, deletedPrompts: 0 });
    expect(h.state.deletes).toEqual([
      { table: 'activity_type', filters: [{ column: 'activity_type', value: ACTIVITY_TYPE }] },
    ]);
  });

  it('returns 500 when the session check fails, without deleting anything', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('session_log', { data: null, error: { message: 'db down' } });

    const res = await req();

    expect(res.status).toBe(500);
    expect(h.state.deletes).toHaveLength(0);
  });
});
