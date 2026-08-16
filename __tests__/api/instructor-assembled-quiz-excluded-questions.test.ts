import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      eq: () => builder,
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

import { POST } from '../../app/api/instructor/assembled-quizzes/[quizId]/excluded-questions/route';

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

function postRequest(body: unknown, token: string | null = 'valid-token', quizId = 'quiz-1') {
  return POST(
    new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}/excluded-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
    { params: { quizId } },
  );
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
});

describe('POST /api/instructor/assembled-quizzes/[quizId]/excluded-questions', () => {
  it('returns 401 without a token', async () => {
    const res = await postRequest({ questionId: 'q-1' }, null);
    expect(res.status).toBe(401);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await postRequest({ questionId: 'q-1' });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 404 when the quiz does not exist', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: null, error: null });

    const res = await postRequest({ questionId: 'q-1' });
    expect(res.status).toBe(404);
  });

  it('returns 403 with an empty body when the caller does not own the quiz', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow({ creator_id: 'someone-else' }), error: null });

    const res = await postRequest({ questionId: 'q-1' });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('rejects a missing questionId with 400', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });

    const res = await postRequest({});
    expect(res.status).toBe(400);
  });

  it('rejects a question that belongs to a catalog this quiz is not linked to, with 400', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'CATALOG_A' }], error: null });
    queue('question', { data: { question_id: 'q-1', activity_type: 'CATALOG_B' }, error: null });

    const res = await postRequest({ questionId: 'q-1' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('This question is not part of this quiz.');
    expect(h.state.tables).not.toContain('quiz_excluded_question');
  });

  it('rejects a question id that matches no question, with 400', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'CATALOG_A' }], error: null });
    queue('question', { data: null, error: null });

    const res = await postRequest({ questionId: 'does-not-exist' });
    expect(res.status).toBe(400);
  });

  it("excludes the question without touching question/answer — only writes to quiz_excluded_question", async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'CATALOG_A' }], error: null });
    queue('question', { data: { question_id: 'q-1', activity_type: 'CATALOG_A' }, error: null });
    queue('quiz_excluded_question', { data: null, error: null });

    const res = await postRequest({ questionId: 'q-1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ questionId: 'q-1' });

    expect(h.state.inserts).toEqual([{ table: 'quiz_excluded_question', payload: { assembled_quiz_id: 'quiz-1', question_id: 'q-1' } }]);
    expect(h.state.inserts.some((i) => i.table === 'question' || i.table === 'answer')).toBe(false);
  });

  it('treats excluding an already-excluded question as success, not an error', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'CATALOG_A' }], error: null });
    queue('question', { data: { question_id: 'q-1', activity_type: 'CATALOG_A' }, error: null });
    queue('quiz_excluded_question', { data: null, error: { message: 'duplicate key', code: '23505' } });

    const res = await postRequest({ questionId: 'q-1' });
    expect(res.status).toBe(200);
  });
});
