import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    deletes: [] as { table: string; column: string; value: unknown }[],
    filters: [] as { table: string; column: string; value: unknown }[],
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
        else state.filters.push({ table, column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
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

import { DELETE, GET } from '../../app/api/instructor/assembled-quizzes/[quizId]/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function quizRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    assembled_quiz_id: 'quiz-1',
    quiz_name: 'Sprint 1 Requirements Check',
    description: 'Covers weak stories.',
    course_id: 'course-1',
    creator_id: 'instructor-1',
    created_at: '2026-08-14T10:00:00',
    ...overrides,
  };
}

function req(quizId = 'quiz-1', token: string | null = 'valid-token') {
  return GET(new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }), {
    params: { quizId },
  });
}

function delReq(quizId = 'quiz-1', token: string | null = 'valid-token') {
  return DELETE(
    new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} }),
    { params: { quizId } },
  );
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.deletes = [];
  h.state.filters = [];
});

describe('GET /api/instructor/assembled-quizzes/[quizId]', () => {
  it('returns 401 without a token', async () => {
    const res = await req('quiz-1', null);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await req();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 404 when the quiz does not exist', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: null, error: null });

    const res = await req();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Quiz not found.');
  });

  it('returns 403 with an empty body when the caller does not own the quiz', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow({ creator_id: 'someone-else' }), error: null });

    const res = await req();
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns the quiz, catalogs (active count = total minus this quiz\'s own exclusions), and level coverage', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('course', { data: { course_name: 'Software Requirements' }, error: null });
    queue('assembled_quiz_catalog', {
      data: [{ activity_type: 'CATALOG_A', catalog: { quiz_name: 'Catalog A', description: 'About A' } }],
      error: null,
    });
    queue('question', {
      data: [
        { question_id: 'q-1', activity_type: 'CATALOG_A', difficulty_level: 1 },
        { question_id: 'q-2', activity_type: 'CATALOG_A', difficulty_level: 1 },
        { question_id: 'q-3', activity_type: 'CATALOG_A', difficulty_level: 1 },
        { question_id: 'q-4', activity_type: 'CATALOG_A', difficulty_level: 1 },
        { question_id: 'q-5', activity_type: 'CATALOG_A', difficulty_level: 2 },
      ],
      error: null,
    });
    queue('quiz_excluded_question', { data: [{ question_id: 'q-1' }], error: null });

    const res = await req();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.quiz).toEqual({
      id: 'quiz-1',
      name: 'Sprint 1 Requirements Check',
      description: 'Covers weak stories.',
      courseId: 'course-1',
      courseName: 'Software Requirements',
    });

    expect(body.catalogs).toEqual([
      { activityType: 'CATALOG_A', name: 'Catalog A', description: 'About A', totalQuestions: 5, excludedCount: 1, activeCount: 4 },
    ]);

    // Level 1 has 4 questions total, 1 excluded -> 3 available, below the 4 required.
    expect(body.levelCoverage).toContainEqual({ level: 1, available: 3, required: 4, sufficient: false });
    expect(body.levelCoverage).toContainEqual({ level: 2, available: 1, required: 4, sufficient: false });
    expect(body.levelCoverage).toContainEqual({ level: 3, available: 0, required: 4, sufficient: false });
  });

  it('returns an empty composition for a quiz with no linked catalogs', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('course', { data: { course_name: 'Software Requirements' }, error: null });
    queue('assembled_quiz_catalog', { data: [], error: null });

    const res = await req();
    const body = await res.json();
    expect(body.catalogs).toEqual([]);
    expect(body.levelCoverage.every((l: { available: number }) => l.available === 0)).toBe(true);
    expect(h.state.tables).not.toContain('question');
  });

  // GitHub #380: hand-picked questions ride along on the same detail response.
  it('returns individually hand-picked questions, with their source catalog, even with no linked catalogs at all', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('course', { data: { course_name: 'Software Requirements' }, error: null });
    queue('assembled_quiz_catalog', { data: [], error: null }); // nothing linked
    queue('assembled_quiz_extra_question', { data: [{ question_id: 'q-9' }], error: null });
    queue('question', {
      data: [
        {
          question_id: 'q-9',
          question_prompt: 'What is a stakeholder?',
          difficulty_level: 2,
          activity_type: 'CATALOG_Z',
          catalog: { quiz_name: 'Stakeholder Basics' },
        },
      ],
      error: null,
    });

    const res = await req();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.extraQuestions).toEqual([
      { questionId: 'q-9', questionText: 'What is a stakeholder?', level: 2, catalogActivityType: 'CATALOG_Z', catalogName: 'Stakeholder Basics' },
    ]);
    expect(body.activeCatalogQuestionIds).toEqual([]);
    expect(body.levelCoverage).toContainEqual({ level: 2, available: 1, required: 4, sufficient: false });
  });
});

describe('DELETE /api/instructor/assembled-quizzes/[quizId]', () => {
  it('returns 401 without a token', async () => {
    const res = await delReq('quiz-1', null);
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

  it('deletes the quiz and touches no session/history table', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz', { data: null, error: null }); // the delete itself

    const res = await delReq();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ quizId: 'quiz-1' });

    expect(h.state.deletes).toContainEqual({ table: 'assembled_quiz', column: 'assembled_quiz_id', value: 'quiz-1' });
    expect(h.state.tables).not.toContain('session_log');
    expect(h.state.tables).not.toContain('answered_question_log');
  });

  it('returns 500 when the delete itself fails', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('assembled_quiz', { data: null, error: { message: 'DB down' } });

    const res = await delReq();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
