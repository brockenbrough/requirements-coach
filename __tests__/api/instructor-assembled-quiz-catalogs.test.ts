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

import { POST } from '../../app/api/instructor/assembled-quizzes/[quizId]/catalogs/route';

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
    new Request(`http://localhost/api/instructor/assembled-quizzes/${quizId}/catalogs`, {
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

describe('POST /api/instructor/assembled-quizzes/[quizId]/catalogs', () => {
  it('returns 401 without a token', async () => {
    const res = await postRequest({ activityType: 'CATALOG_A' }, null);
    expect(res.status).toBe(401);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await postRequest({ activityType: 'CATALOG_A' });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 404 when the quiz does not exist', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: null, error: null });

    const res = await postRequest({ activityType: 'CATALOG_A' });
    expect(res.status).toBe(404);
  });

  it('returns 403 with an empty body when the caller does not own the quiz', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow({ creator_id: 'someone-else' }), error: null });

    const res = await postRequest({ activityType: 'CATALOG_A' });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('rejects a missing activityType with 400', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });

    const res = await postRequest({});
    expect(res.status).toBe(400);
  });

  it('rejects an activityType that matches no catalog with 400', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('activity_type', { data: null, error: null });

    const res = await postRequest({ activityType: 'NOT_REAL' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('activityType must be a valid catalog.');
    expect(h.state.tables).not.toContain('assembled_quiz_catalog');
  });

  it('links the catalog to the quiz', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('activity_type', { data: { activity_type: 'CATALOG_A' }, error: null });
    queue('assembled_quiz_catalog', { data: null, error: null });

    const res = await postRequest({ activityType: 'CATALOG_A' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ activityType: 'CATALOG_A' });

    expect(h.state.inserts).toContainEqual({
      table: 'assembled_quiz_catalog',
      payload: { assembled_quiz_id: 'quiz-1', activity_type: 'CATALOG_A' },
    });
  });

  it('treats linking an already-linked catalog as success, not an error', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('activity_type', { data: { activity_type: 'CATALOG_A' }, error: null });
    queue('assembled_quiz_catalog', { data: null, error: { message: 'duplicate key', code: '23505' } });

    const res = await postRequest({ activityType: 'CATALOG_A' });
    expect(res.status).toBe(200);
  });

  it('returns 500 when the link insert fails for a reason other than the unique index', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: quizRow(), error: null });
    queue('activity_type', { data: { activity_type: 'CATALOG_A' }, error: null });
    queue('assembled_quiz_catalog', { data: null, error: { message: 'DB down' } });

    const res = await postRequest({ activityType: 'CATALOG_A' });
    expect(res.status).toBe(500);
  });
});
