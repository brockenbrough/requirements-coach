import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
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
          ? { data: { user: { id: 'user-123' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/activities/write-acceptance-criteria/user-story/route';

function req(token: string | null = 'valid-token') {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('http://localhost/api/activities/write-acceptance-criteria/user-story', { headers });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
});

describe('GET /api/activities/write-acceptance-criteria/user-story', () => {
  it('returns 401 when no token is supplied', async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is invalid', async () => {
    const res = await GET(req('bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns a random story mapped to { userStoryId, description }', async () => {
    queue('user_story', {
      data: [{ user_story_id: 'story-1', story_text: 'As a student, I want to log in.' }],
      error: null,
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ userStoryId: 'story-1', description: 'As a student, I want to log in.' });
  });

  it('does not always return the same story (random draw)', async () => {
    const seed = [
      { user_story_id: 'story-1', story_text: 'Story one' },
      { user_story_id: 'story-2', story_text: 'Story two' },
      { user_story_id: 'story-3', story_text: 'Story three' },
    ];

    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      queue('user_story', { data: seed, error: null });
      const res = await GET(req());
      const body = await res.json();
      seen.add(body.userStoryId as string);
    }

    expect(seen.size).toBeGreaterThan(1);
  });

  it('returns 500 when the query fails', async () => {
    queue('user_story', { data: null, error: { message: 'DB error' } });
    const res = await GET(req());
    expect(res.status).toBe(500);
  });

  it('returns 500 when user_story has no rows', async () => {
    queue('user_story', { data: [], error: null });
    const res = await GET(req());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/no user stories/i);
  });
});
