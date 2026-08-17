import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        state.filters.push({ table, column: `${column} (in)`, value });
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
      const result = h.state.queues[table]?.shift() ?? { data: [], error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/instructor/acceptance-criteria/statistics/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

/**
 * listOwnedActivityTypes' query (activity_type filtered to creator_id + grading_kind) — must be
 * queued before submission/user_story in every test that expects those to actually be reached,
 * since owning zero llm-graded types short-circuits to zeroed stats before either is queried.
 */
function queueOwnedActivityTypes(types: string[]) {
  queue('activity_type', { data: types.map((activity_type) => ({ activity_type })), error: null });
}

function makeRequest(token?: string) {
  return new Request('http://localhost/api/instructor/acceptance-criteria/statistics', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/instructor/acceptance-criteria/statistics', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
    h.state.filters = [];
  });

  it('returns 401 when no token is provided', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is invalid', async () => {
    const res = await GET(makeRequest('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns 403 with empty body when caller is a student', async () => {
    queueRole('student');
    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('scopes activity_type to this instructor’s own creator_id and llm-graded grading_kind', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes([]);

    await GET(makeRequest('valid-token'));

    expect(h.state.filters).toContainEqual({ table: 'activity_type', column: 'creator_id', value: 'instructor-1' });
    expect(h.state.filters).toContainEqual({ table: 'activity_type', column: 'grading_kind', value: 'llm-graded' });
  });

  it('returns zeroed stats without querying submission or user_story when the instructor owns no llm-graded activity types', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes([]);

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(200);

    const { statistics } = await res.json();
    expect(statistics.totalSubmissions).toBe(0);
    expect(statistics.gradedSubmissions).toBe(0);
    expect(statistics.averageScore).toBeNull();
    expect(statistics.studentsAttempted).toBe(0);
    expect(statistics.byUserStory).toEqual([]);
    expect(statistics.scoreDistribution).toHaveLength(10);
    expect(statistics.scoreDistribution.every((b: { count: number }) => b.count === 0)).toBe(true);
    expect(h.state.tables).not.toContain('submission');
    expect(h.state.tables).not.toContain('user_story');
  });

  it('returns 200 with zeroed stats when the instructor owns a type but no submissions exist yet', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [], error: null });
    queue('user_story', { data: [], error: null });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(200);

    const { statistics } = await res.json();
    expect(statistics.totalSubmissions).toBe(0);
    expect(statistics.gradedSubmissions).toBe(0);
    expect(statistics.averageScore).toBeNull();
    expect(statistics.studentsAttempted).toBe(0);
    expect(statistics.byUserStory).toEqual([]);
    expect(h.state.tables).toContain('submission');
    expect(h.state.tables).toContain('user_story');
  });

  it('scopes submission and user_story to the owned activity types', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [], error: null });
    queue('user_story', { data: [], error: null });

    await GET(makeRequest('valid-token'));

    expect(h.state.filters).toContainEqual({
      table: 'submission',
      column: 'story.activity_type (in)',
      value: ['MY_LLM_CATALOG'],
    });
    expect(h.state.filters).toContainEqual({
      table: 'user_story',
      column: 'activity_type (in)',
      value: ['MY_LLM_CATALOG'],
    });
  });

  it('returns correct aggregates for mixed graded and ungraded submissions', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', {
      data: [
        { user_id: 'u1', user_story_id: 'us1', llm_score: 8 },
        { user_id: 'u2', user_story_id: 'us1', llm_score: 6 },
        { user_id: 'u1', user_story_id: 'us2', llm_score: null },
      ],
      error: null,
    });
    queue('user_story', {
      data: [
        { user_story_id: 'us1', story_text: 'Story A' },
        { user_story_id: 'us2', story_text: 'Story B' },
      ],
      error: null,
    });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(200);

    const { statistics } = await res.json();
    expect(statistics.totalSubmissions).toBe(3);
    expect(statistics.gradedSubmissions).toBe(2);
    expect(statistics.averageScore).toBe(7);
    expect(statistics.studentsAttempted).toBe(2);
  });

  it('includes user stories with no submissions in byUserStory', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', {
      data: [{ user_id: 'u1', user_story_id: 'us1', llm_score: 5 }],
      error: null,
    });
    queue('user_story', {
      data: [
        { user_story_id: 'us1', story_text: 'Story A' },
        { user_story_id: 'us2', story_text: 'Story B — never attempted' },
      ],
      error: null,
    });

    const res = await GET(makeRequest('valid-token'));
    const { statistics } = await res.json();

    const storyB = statistics.byUserStory.find((s: { userStoryId: string }) => s.userStoryId === 'us2');
    expect(storyB).toBeDefined();
    expect(storyB.submissionCount).toBe(0);
    expect(storyB.averageScore).toBeNull();
  });

  it('sorts byUserStory lowest-average-first with null-average rows last', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', {
      data: [
        { user_id: 'u1', user_story_id: 'us1', llm_score: 9 },
        { user_id: 'u2', user_story_id: 'us2', llm_score: 4 },
      ],
      error: null,
    });
    queue('user_story', {
      data: [
        { user_story_id: 'us1', story_text: 'High avg' },
        { user_story_id: 'us2', story_text: 'Low avg' },
        { user_story_id: 'us3', story_text: 'No submissions' },
      ],
      error: null,
    });

    const res = await GET(makeRequest('valid-token'));
    const { statistics } = await res.json();
    const ids = statistics.byUserStory.map((s: { userStoryId: string }) => s.userStoryId);

    expect(ids).toEqual(['us2', 'us1', 'us3']);
  });

  it('computes scoreDistribution correctly', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', {
      data: [
        { user_id: 'u1', user_story_id: 'us1', llm_score: 7 },
        { user_id: 'u2', user_story_id: 'us1', llm_score: 7 },
        { user_id: 'u3', user_story_id: 'us1', llm_score: 9 },
      ],
      error: null,
    });
    queue('user_story', { data: [{ user_story_id: 'us1', story_text: 'Story A' }], error: null });

    const res = await GET(makeRequest('valid-token'));
    const { statistics } = await res.json();

    const bucket7 = statistics.scoreDistribution.find((b: { score: number }) => b.score === 7);
    const bucket9 = statistics.scoreDistribution.find((b: { score: number }) => b.score === 9);
    const bucket1 = statistics.scoreDistribution.find((b: { score: number }) => b.score === 1);
    expect(bucket7.count).toBe(2);
    expect(bucket9.count).toBe(1);
    expect(bucket1.count).toBe(0);
  });

  it('returns 500 when the owned-activity-type lookup fails, without querying submission or user_story', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: { message: 'DB error' } });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB error');
    expect(h.state.tables).not.toContain('submission');
    expect(h.state.tables).not.toContain('user_story');
  });

  it('returns 500 when submission query fails', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: null, error: { message: 'DB error' } });
    queue('user_story', { data: [], error: null });

    const res = await GET(makeRequest('valid-token'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB error');
  });
});
