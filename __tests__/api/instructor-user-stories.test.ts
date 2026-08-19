import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { table: string; column: string; value: unknown }[],
    inserts: [] as { table: string; payload: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
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

import { GET, POST } from '../../app/api/instructor/user-stories/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function makeRequest(token?: string) {
  return new Request('http://localhost/api/instructor/user-stories', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
  h.state.inserts = [];
});

describe('GET /api/instructor/user-stories', () => {

  it('returns 401 when no token is provided', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is invalid', async () => {
    const res = await GET(makeRequest('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller is a student', async () => {
    queueRole('student');
    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 200 with the instructor’s own stories, mapped to camelCase', async () => {
    queueRole('instructor');
    queue('user_story', {
      data: [
        { user_story_id: 'story-1', story_text: 'As a user, I want...', difficulty_level: 1, activity_type: 'IDENTIFY_WEAK_USER_STORIES' },
        { user_story_id: 'story-2', story_text: 'As a student, I want...', difficulty_level: 2, activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA' },
      ],
      error: null,
    });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.stories).toEqual([
      { id: 'story-1', storyText: 'As a user, I want...', difficultyLevel: 1, activityType: 'IDENTIFY_WEAK_USER_STORIES' },
      { id: 'story-2', storyText: 'As a student, I want...', difficultyLevel: 2, activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA' },
    ]);
  });

  it('returns 200 with an empty list when the instructor has authored no stories', async () => {
    queueRole('instructor');
    queue('user_story', { data: [], error: null });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stories).toEqual([]);
  });

  it('filters user_story by creator_id = the calling instructor', async () => {
    queueRole('instructor');
    queue('user_story', { data: [], error: null });

    await GET(makeRequest('valid-token'));

    const creatorFilter = h.state.filters.find(
      (f) => f.table === 'user_story' && f.column === 'creator_id' && f.value === 'instructor-1',
    );
    expect(creatorFilter).toBeDefined();
  });

  it('returns 500 when the database returns an error', async () => {
    queueRole('instructor');
    queue('user_story', { data: null, error: { message: 'DB failure' } });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB failure');
  });
});

/** activity_type as getGradingKind's .select('grading_kind').maybeSingle() returns it. */
function queueGradingKind(gradingKind: string | null) {
  queue('activity_type', { data: gradingKind === null ? null : { grading_kind: gradingKind }, error: null });
}

function postRequest(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/user-stories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    storyText: 'As a shopper, I want to save my cart, so that I can return to it later.',
    activityType: 'WRITE_ACCEPTANCE_CRITERIA',
    difficultyLevel: 2,
    ...overrides,
  };
}

describe('POST /api/instructor/user-stories', () => {
  it('returns 401 without a token', async () => {
    const res = await POST(postRequest(validBody(), null));
    expect(res.status).toBe(401);
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 400 for an invalid JSON body', async () => {
    queueRole('instructor');
    const res = await POST(
      new Request('http://localhost/api/instructor/user-stories', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when storyText is missing or blank', async () => {
    for (const storyText of [undefined, '', '   ', 42]) {
      queueRole('instructor');
      const res = await POST(postRequest(validBody({ storyText })));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/storyText/);
    }
  });

  it('returns 400 for an activityType that matches no catalog, without inserting', async () => {
    queueRole('instructor');
    queueGradingKind(null);

    const res = await POST(postRequest(validBody({ activityType: 'NOPE' })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid activity type/i);
    expect(h.state.inserts).toEqual([]);
  });

  // The invariant supabase/schema.sql says Postgres can't express: a prompt on an MCQ catalog
  // would be read by nothing at all, so storing it would be a silent no-op.
  it('returns 400 when the catalog is a multiple-choice quiz', async () => {
    queueRole('instructor');
    queueGradingKind('mcq');

    const res = await POST(postRequest(validBody({ activityType: 'IDENTIFY_WEAK_USER_STORIES' })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/LLM-graded/i);
    expect(h.state.inserts).toEqual([]);
  });

  // GitHub #478: a built-in example catalog (creator_id IS NULL) is strictly read-only — no new
  // prompt may be filed under it, even though the activityType itself is a valid llm-graded key.
  it('rejects adding a prompt to a built-in example catalog with 403', async () => {
    queueRole('instructor');
    queueGradingKind('llm-graded');
    queue('activity_type', { data: { creator_id: null }, error: null }); // assertCatalogIsEditable

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/built-in example catalog/);
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 400 for a difficulty level outside 1-3', async () => {
    for (const difficultyLevel of [0, 4, '2', null, undefined]) {
      queueRole('instructor');
      queueGradingKind('llm-graded');

      const res = await POST(postRequest(validBody({ difficultyLevel })));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/difficultyLevel/);
    }
  });

  it('creates the prompt with creator_id from the token, trimmed text, and returns 201', async () => {
    queueRole('instructor');
    queueGradingKind('llm-graded');
    queue('user_story', { error: null });

    const res = await POST(postRequest(validBody({ storyText: '  As a shopper, I want a wishlist.  ' })));
    expect(res.status).toBe(201);

    const insert = h.state.inserts.find((i) => i.table === 'user_story');
    expect(insert?.payload).toMatchObject({
      story_text: 'As a shopper, I want a wishlist.',
      activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
      difficulty_level: 2,
      creator_id: 'instructor-1',
    });

    const body = await res.json();
    expect(body.userStoryId).toBe((insert?.payload as { user_story_id: string }).user_story_id);
  });

  // creator_id is what decides which instructor_llm_config grades submissions against this prompt,
  // so it must never be client-supplied.
  it('ignores a creator_id in the request body', async () => {
    queueRole('instructor');
    queueGradingKind('llm-graded');
    queue('user_story', { error: null });

    await POST(postRequest(validBody({ creator_id: 'someone-else', creatorId: 'someone-else' })));

    const insert = h.state.inserts.find((i) => i.table === 'user_story');
    expect(insert?.payload).toMatchObject({ creator_id: 'instructor-1' });
  });

  it('returns 500 when the insert fails', async () => {
    queueRole('instructor');
    queueGradingKind('llm-graded');
    queue('user_story', { error: { message: 'DB down' } });

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
