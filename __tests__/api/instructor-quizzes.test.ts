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
      is: (column: string, value: unknown) => {
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

import { GET } from '../../app/api/instructor/quizzes/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

/** An activity_type row as GET's creator + question/user_story(count) + assembled_quiz_catalog(count) embed actually returns it. */
function quizRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    quiz_name: 'Identify Weak User Stories',
    description: null,
    grading_kind: 'mcq',
    creator_id: null,
    creator: null,
    question: [{ count: 36 }],
    user_story: [{ count: 0 }],
    assembled_quiz_catalog: [{ count: 0 }],
    ...overrides,
  };
}

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/quizzes', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.orders = [];
  h.state.filters = [];
});

describe('GET /api/instructor/quizzes', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('returns 200 with an empty list when there are no quizzes', async () => {
    queueRole('instructor');
    queue('activity_type', { data: [], error: null });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quizzes).toEqual([]);
  });

  it('scopes the query to the caller — built-in catalogs are excluded by construction', async () => {
    queueRole('instructor');
    queue('activity_type', { data: [], error: null });

    await GET(req());

    expect(h.state.filters).toContainEqual({ table: 'activity_type', column: 'creator_id', value: 'instructor-1' });
  });

  it('reports how many assembled quizzes (GitHub #360) reference the catalog', async () => {
    queueRole('instructor');
    queue('activity_type', {
      data: [quizRow({ assembled_quiz_catalog: [{ count: 3 }] })],
      error: null,
    });

    const res = await GET(req());
    const body = await res.json();

    expect(body.quizzes[0]).toMatchObject({ quizCount: 3 });
  });

  it("reports the instructor's full name for a quiz they created", async () => {
    queueRole('instructor');
    queue('activity_type', {
      data: [
        quizRow({
          activity_type: 'MY_CUSTOM_QUIZ',
          quiz_name: 'My Custom Quiz',
          description: 'A quiz about things',
          creator_id: 'instructor-1',
          creator: { first_name: 'Ada', last_name: 'Brockenbrough', username: 'abrock' },
          question: [{ count: 0 }],
        }),
      ],
      error: null,
    });

    const res = await GET(req());
    const body = await res.json();

    expect(body.quizzes).toEqual([
      {
        activityType: 'MY_CUSTOM_QUIZ',
        name: 'My Custom Quiz',
        description: 'A quiz about things',
        authorName: 'Ada Brockenbrough',
        gradingKind: 'mcq',
        questionCount: 0,
        quizCount: 0,
        isBuiltIn: false,
      },
    ]);
  });

  it('falls back to the creator username when first/last name are blank', async () => {
    queueRole('instructor');
    queue('activity_type', {
      data: [
        quizRow({
          creator_id: 'instructor-1',
          creator: { first_name: null, last_name: null, username: 'abrock' },
        }),
      ],
      error: null,
    });

    const res = await GET(req());
    const body = await res.json();
    expect(body.quizzes[0].authorName).toBe('abrock');
  });

  it('falls back to "Unknown instructor" when neither a name nor a username is available', async () => {
    queueRole('instructor');
    queue('activity_type', {
      data: [quizRow({ creator_id: 'instructor-1', creator: null })],
      error: null,
    });

    const res = await GET(req());
    const body = await res.json();
    expect(body.quizzes[0].authorName).toBe('Unknown instructor');
  });

  it('defaults questionCount to 0 when the quiz has no questions yet', async () => {
    queueRole('instructor');
    queue('activity_type', { data: [quizRow({ question: [] })], error: null });

    const res = await GET(req());
    const body = await res.json();
    expect(body.quizzes[0].questionCount).toBe(0);
  });

  // questionCount is one field for both pools: an llm-graded catalog counts its prompts, and its
  // (always empty) question embed must not win.
  it('counts user_story rows instead of questions for an llm-graded catalog', async () => {
    queueRole('instructor');
    queue('activity_type', {
      data: [
        quizRow({
          activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
          quiz_name: 'Write Acceptance Criteria',
          grading_kind: 'llm-graded',
          question: [{ count: 0 }],
          user_story: [{ count: 24 }],
        }),
      ],
      error: null,
    });

    const res = await GET(req());
    const body = await res.json();

    expect(body.quizzes[0]).toMatchObject({ gradingKind: 'llm-graded', questionCount: 24 });
  });

  it('orders by quiz_name ascending', async () => {
    queueRole('instructor');
    queue('activity_type', { data: [], error: null });

    await GET(req());

    expect(h.state.orders).toContainEqual({ table: 'activity_type', column: 'quiz_name', ascending: true });
  });

  it('returns 500 when the query fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: { message: 'DB down' } });

    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });

  // GitHub #478: every instructor also sees the built-in example catalogs, separate from their own.
  describe('exampleCatalogs (GitHub #478)', () => {
    it('returns the built-in catalogs (creator_id IS NULL), flagged isBuiltIn, alongside the caller\'s own', async () => {
      queueRole('instructor');
      queue('activity_type', { data: [], error: null }); // mine
      queue('activity_type', { data: [quizRow()], error: null }); // examples

      const res = await GET(req());
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.exampleCatalogs).toEqual([
        {
          activityType: 'IDENTIFY_WEAK_USER_STORIES',
          name: 'Identify Weak User Stories',
          description: null,
          authorName: 'Built-in',
          gradingKind: 'mcq',
          questionCount: 36,
          quizCount: 0,
          isBuiltIn: true,
        },
      ]);
    });

    it('queries the example catalogs with .is(creator_id, null), independent of the "mine" filter', async () => {
      queueRole('instructor');
      queue('activity_type', { data: [], error: null });
      queue('activity_type', { data: [], error: null });

      await GET(req());

      expect(h.state.filters).toContainEqual({ table: 'activity_type', column: 'creator_id', value: null });
    });

    it('flags a quiz the caller created as isBuiltIn: false', async () => {
      queueRole('instructor');
      queue('activity_type', { data: [quizRow({ creator_id: 'instructor-1', creator: null })], error: null });
      queue('activity_type', { data: [], error: null });

      const res = await GET(req());
      const body = await res.json();

      expect(body.quizzes[0].isBuiltIn).toBe(false);
    });

    it('returns 500 when the example-catalogs query fails, after the "mine" query already succeeded', async () => {
      queueRole('instructor');
      queue('activity_type', { data: [], error: null }); // mine
      queue('activity_type', { data: null, error: { message: 'DB down' } }); // examples

      const res = await GET(req());
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('DB down');
    });
  });
});
