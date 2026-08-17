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

import { DELETE } from '../../app/api/instructor/assembled-quizzes/[quizId]/extra-questions/[questionId]/route';

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

function delReq(quizId = 'quiz-1', questionId = 'q-1', token: string | null = 'valid-token') {
  return DELETE(
    new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}/extra-questions/${questionId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: { quizId, questionId } },
  );
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.deletes = [];
});

describe('DELETE /api/instructor/assembled-quizzes/[quizId]/extra-questions/[questionId]', () => {
  it('returns 401 without a token', async () => {
    const res = await delReq('quiz-1', 'q-1', null);
    expect(res.status).toBe(401);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await delReq();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 404 when the quiz does not exist', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: null, error: null });

    const res = await delReq();
    expect(res.status).toBe(404);
  });

  it('returns 403 with an empty body when the caller does not own the quiz', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow({ creator_id: 'someone-else' }), error: null });

    const res = await delReq();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('removes only the assembled_quiz_extra_question link, scoped to this quiz — the original question is never touched', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz_extra_question', { data: null, error: null });

    const res = await delReq('quiz-1', 'q-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ questionId: 'q-1' });

    expect(h.state.deletes).toContainEqual({ table: 'assembled_quiz_extra_question', column: 'assembled_quiz_id', value: 'quiz-1' });
    expect(h.state.deletes).toContainEqual({ table: 'assembled_quiz_extra_question', column: 'question_id', value: 'q-1' });
    expect(h.state.tables).not.toContain('question');
  });

  it("removing a hand-picked question from one quiz never touches another quiz's rows (scoped by assembled_quiz_id)", async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow({ assembled_quiz_id: 'quiz-1' }), error: null });
    queue('assembled_quiz_extra_question', { data: null, error: null });

    await delReq('quiz-1', 'q-1');

    // The delete is filtered to assembled_quiz_id = 'quiz-1' specifically — a second quiz that
    // also hand-picked the same question keeps its own row, since the delete never names it.
    expect(h.state.deletes).toContainEqual({ table: 'assembled_quiz_extra_question', column: 'assembled_quiz_id', value: 'quiz-1' });
    expect(h.state.deletes.some((d) => d.column === 'assembled_quiz_id' && d.value !== 'quiz-1')).toBe(false);
  });

  it('is idempotent: removing a question that was never hand-picked is still 200', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz_extra_question', { data: null, error: null });

    const res = await delReq();
    expect(res.status).toBe(200);
  });
});
