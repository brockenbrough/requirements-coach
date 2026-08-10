import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    filters: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
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
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/instructor/user-stories/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function makeRequest(token?: string) {
  return new Request('http://localhost/api/instructor/user-stories', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/instructor/user-stories', () => {
  beforeEach(() => {
    h.state.queues = {};
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
