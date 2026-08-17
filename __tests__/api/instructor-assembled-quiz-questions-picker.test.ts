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

import { GET } from '../../app/api/instructor/assembled-quizzes/questions/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/assembled-quizzes/questions', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.orders = [];
  h.state.filters = [];
});

describe('GET /api/instructor/assembled-quizzes/questions', () => {
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
    expect(h.state.tables).not.toContain('question');
    expect(h.state.tables).not.toContain('user_story');
  });

  it('returns only the caller\'s own questions, with each one\'s source catalog name', async () => {
    queueRole('instructor');
    queue('question', {
      data: [
        {
          question_id: 'q-1',
          question_prompt: 'Which story is weakest?',
          difficulty_level: 1,
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          catalog: { quiz_name: 'Identify Weak User Stories' },
        },
        {
          question_id: 'q-2',
          question_prompt: 'What is a stakeholder?',
          difficulty_level: 2,
          activity_type: 'CUSTOM_QUIZ',
          catalog: { quiz_name: 'My Custom Quiz' },
        },
      ],
      error: null,
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.questions).toEqual([
      { id: 'q-1', questionText: 'Which story is weakest?', level: 1, catalogActivityType: 'IDENTIFY_WEAK_USER_STORIES', catalogName: 'Identify Weak User Stories' },
      { id: 'q-2', questionText: 'What is a stakeholder?', level: 2, catalogActivityType: 'CUSTOM_QUIZ', catalogName: 'My Custom Quiz' },
    ]);

    expect(h.state.filters).toContainEqual({ table: 'question', column: 'user_id', value: 'instructor-1' });
  });

  it('returns an empty list when there are no questions', async () => {
    queueRole('instructor');
    queue('question', { data: [], error: null });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toEqual([]);
  });

  it('orders by question_prompt ascending', async () => {
    queueRole('instructor');
    queue('question', { data: [], error: null });

    await GET(req());

    expect(h.state.orders).toContainEqual({ table: 'question', column: 'question_prompt', ascending: true });
  });

  it('returns 500 when the question query fails', async () => {
    queueRole('instructor');
    queue('question', { data: null, error: { message: 'DB down' } });

    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });

  // llm-graded parity: the same picker also returns the caller's own prompts, scoped by
  // creator_id (user_story's owner column — not user_id, which question uses).
  it('returns only the caller\'s own prompts, with each one\'s source catalog name', async () => {
    queueRole('instructor');
    queue('question', { data: [], error: null });
    queue('user_story', {
      data: [
        {
          user_story_id: 'story-1',
          story_text: 'As a shopper, I want a cart.',
          difficulty_level: 1,
          activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
          catalog: { quiz_name: 'Write Acceptance Criteria' },
        },
      ],
      error: null,
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.userStories).toEqual([
      {
        id: 'story-1',
        storyText: 'As a shopper, I want a cart.',
        level: 1,
        catalogActivityType: 'WRITE_ACCEPTANCE_CRITERIA',
        catalogName: 'Write Acceptance Criteria',
      },
    ]);
    expect(h.state.filters).toContainEqual({ table: 'user_story', column: 'creator_id', value: 'instructor-1' });
  });

  it('returns 500 when the prompt query fails', async () => {
    queueRole('instructor');
    queue('question', { data: [], error: null });
    queue('user_story', { data: null, error: { message: 'DB down' } });

    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
