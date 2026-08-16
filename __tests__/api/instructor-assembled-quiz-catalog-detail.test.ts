import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
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
        if (isDelete) state.deletes.push({ table, column, value });
        return builder;
      },
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

import { DELETE, GET } from '../../app/api/instructor/assembled-quizzes/[quizId]/catalogs/[activityType]/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function quizRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    assembled_quiz_id: 'quiz-1',
    quiz_name: 'Sprint 1 Requirements Check',
    description: null,
    course_id: 'course-1',
    creator_id: 'instructor-1',
    created_at: '2026-08-14T10:00:00',
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
      { answer: { answer_id: 'a-1', option_text: 'Wrong', is_correct: false, explanation: 'Incorrect.' } },
      { answer: { answer_id: 'a-2', option_text: 'Right', is_correct: true, explanation: 'Correct.' } },
    ],
    ...overrides,
  };
}

function getReq(quizId = 'quiz-1', activityType = 'CATALOG_A', token: string | null = 'valid-token') {
  return GET(
    new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}/catalogs/${activityType}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: { quizId, activityType } },
  );
}

function delReq(quizId = 'quiz-1', activityType = 'CATALOG_A', token: string | null = 'valid-token') {
  return DELETE(
    new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}/catalogs/${activityType}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: { quizId, activityType } },
  );
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.deletes = [];
});

describe('GET /api/instructor/assembled-quizzes/[quizId]/catalogs/[activityType]', () => {
  it('returns 401 without a token', async () => {
    const res = await getReq('quiz-1', 'CATALOG_A', null);
    expect(res.status).toBe(401);
  });

  it('returns 403 with an empty body when the caller does not own the quiz', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow({ creator_id: 'someone-else' }), error: null });

    const res = await getReq();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 404 when the catalog does not exist', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('activity_type', { data: null, error: null });

    const res = await getReq();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Catalog not found.');
  });

  it('returns the catalog and its questions, each annotated with this quiz\'s own exclusion state', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('activity_type', {
      data: { activity_type: 'CATALOG_A', quiz_name: 'Catalog A', description: null, creator_id: null, creator: null },
      error: null,
    });
    queue('question', { data: [questionRow(), questionRow({ question_id: 'q-2' })], error: null });
    queue('quiz_excluded_question', { data: [{ question_id: 'q-2' }], error: null });

    const res = await getReq();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.catalog.name).toBe('Catalog A');
    expect(body.questions).toHaveLength(2);
    expect(body.questions.find((q: { id: string }) => q.id === 'q-1').excludedForQuiz).toBe(false);
    expect(body.questions.find((q: { id: string }) => q.id === 'q-2').excludedForQuiz).toBe(true);
  });

  it('never issues an update or delete against question/answer while building this view', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('activity_type', {
      data: { activity_type: 'CATALOG_A', quiz_name: 'Catalog A', description: null, creator_id: null, creator: null },
      error: null,
    });
    queue('question', { data: [questionRow()], error: null });
    queue('quiz_excluded_question', { data: [], error: null });

    await getReq();

    expect(h.state.deletes).toEqual([]);
  });
});

describe('DELETE /api/instructor/assembled-quizzes/[quizId]/catalogs/[activityType]', () => {
  it('returns 401 without a token', async () => {
    const res = await delReq('quiz-1', 'CATALOG_A', null);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the catalog is not linked to this quiz', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'CATALOG_B' }], error: null });

    const res = await delReq();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('This catalog is not linked to this quiz.');
  });

  it('unlinks the catalog without touching the catalog or its questions', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'CATALOG_A' }], error: null });
    queue('assembled_quiz_catalog', { data: null, error: null }); // the delete itself

    const res = await delReq();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ activityType: 'CATALOG_A' });

    expect(h.state.deletes).toContainEqual({ table: 'assembled_quiz_catalog', column: 'assembled_quiz_id', value: 'quiz-1' });
    expect(h.state.deletes).toContainEqual({ table: 'assembled_quiz_catalog', column: 'activity_type', value: 'CATALOG_A' });
    expect(h.state.tables).not.toContain('question');
    expect(h.state.tables).not.toContain('activity_type');
  });
});
