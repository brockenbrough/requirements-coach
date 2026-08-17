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

import { DELETE } from '../../app/api/instructor/assembled-quizzes/[quizId]/excluded-user-stories/[userStoryId]/route';

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

function delReq(quizId = 'quiz-1', userStoryId = 'story-1', token: string | null = 'valid-token') {
  return DELETE(
    new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}/excluded-user-stories/${userStoryId}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: { quizId, userStoryId } },
  );
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.deletes = [];
});

describe('DELETE /api/instructor/assembled-quizzes/[quizId]/excluded-user-stories/[userStoryId]', () => {
  it('returns 401 without a token', async () => {
    const res = await delReq('quiz-1', 'story-1', null);
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

  it('re-includes the prompt, touching only quiz_excluded_user_story', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('quiz_excluded_user_story', { data: null, error: null });

    const res = await delReq();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ userStoryId: 'story-1' });

    expect(h.state.deletes).toContainEqual({ table: 'quiz_excluded_user_story', column: 'assembled_quiz_id', value: 'quiz-1' });
    expect(h.state.deletes).toContainEqual({ table: 'quiz_excluded_user_story', column: 'user_story_id', value: 'story-1' });
    expect(h.state.tables).not.toContain('user_story');
  });

  it('is idempotent: re-including a prompt that was never excluded is still 200', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('quiz_excluded_user_story', { data: null, error: null }); // delete matches 0 rows, still no error

    const res = await delReq();
    expect(res.status).toBe(200);
  });
});
