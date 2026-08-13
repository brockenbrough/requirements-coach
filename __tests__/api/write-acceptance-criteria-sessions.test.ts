import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    deletes: [] as string[],
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      delete: () => {
        state.deletes.push(table);
        return builder;
      },
      maybeSingle: async () => result,
      single: async () => result,
      // PostgrestFilterBuilder is thenable — queries without .single() are awaited directly.
      then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onOk, onErr),
    };
    return builder;
  }

  return { state, makeBuilder };
});

/** Queues the result the next `from(table)` chain resolves to. */
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

import { POST } from '../../app/api/activities/write-acceptance-criteria/sessions/route';

const sessionRow = {
  session_id: 'ac-session-1',
  user_id: 'user-123',
  activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
  difficulty_level: 1,
  started_at: '2026-07-29T10:00:00.000Z',
  ended_at: null,
  status: 'in-progress',
  cumulative_score: 0,
  max_score: 40,
  passed: false,
  badge_id: null,
};

const pool = Array.from({ length: 6 }, (_, i) => ({ user_story_id: `story-${i + 1}` }));

const drawnStories = Array.from({ length: 4 }, (_, i) => ({
  position: i,
  story: { user_story_id: `story-${i + 1}`, story_text: `As a user, I want ${i + 1}...` },
}));

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/activities/write-acceptance-criteria/sessions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** Queues a full happy-path draw: no running session, big enough pool, insert, links, reload. */
function queueHappyPath() {
  queue('session_log', { data: null, error: null });                    // no session in progress
  queue('user_story', { data: pool, error: null });                     // story bank
  queue('session_log', { data: sessionRow, error: null });              // insert
  queue('session_to_user_story', { data: null, error: null });          // insert links
  queue('session_to_user_story', { data: drawnStories, error: null });  // reload for the response
}

describe('POST /api/activities/write-acceptance-criteria/sessions', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.inserts = [];
    h.state.deletes = [];
    h.state.tables = [];
  });

  it('returns 401 without a token', async () => {
    expect((await POST(req(null))).status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    expect((await POST(req('bad-token'))).status).toBe(401);
  });

  it('returns 400 when fewer than STORIES_PER_SESSION user stories exist', async () => {
    queue('session_log', { data: null, error: null });
    queue('user_story', { data: pool.slice(0, 3), error: null });

    const response = await POST(req());

    expect(response.status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('creates a session with 4 distinct stories and the required defaults', async () => {
    queueHappyPath();

    const response = await POST(req());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.session).toEqual(sessionRow);
    expect(body.resumed).toBe(false);
    expect(body.stories).toHaveLength(4);
    expect(body.stories.map((s: { position: number }) => s.position)).toEqual([0, 1, 2, 3]);

    const sessionInsert = h.state.inserts.find((i) => i.table === 'session_log')!
      .payload as Record<string, unknown>;

    expect(sessionInsert).toMatchObject({
      user_id: 'user-123',
      activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
      difficulty_level: 1,
      status: 'in-progress',
      cumulative_score: 0,
      max_score: 40,
      passed: false,
    });

    const links = h.state.inserts.find((i) => i.table === 'session_to_user_story')!
      .payload as { user_story_id: string; position: number }[];

    expect(links).toHaveLength(4);
    expect(new Set(links.map((l) => l.user_story_id)).size).toBe(4);
    expect(links.map((l) => l.position)).toEqual([0, 1, 2, 3]);
  });

  // REQ-PL-2.1 equivalent for this activity: start and resume are the same, idempotent call.
  it('returns the running session instead of creating a second one', async () => {
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });

    const response = await POST(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumed).toBe(true);
    expect(body.session).toEqual(sessionRow);
    expect(body.stories).toHaveLength(4);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns the winning session when a parallel request hit the unique index', async () => {
    queue('session_log', { data: null, error: null });
    queue('user_story', { data: pool, error: null });
    queue('session_log', { data: null, error: { code: '23505', message: 'duplicate key' } });
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: drawnStories, error: null });

    const response = await POST(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumed).toBe(true);
    expect(body.session).toEqual(sessionRow);
  });

  it('returns 409 when the student has no profile row yet', async () => {
    queue('session_log', { data: null, error: null });
    queue('user_story', { data: pool, error: null });
    queue('session_log', {
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint fk_session_log_user' },
    });

    const response = await POST(req());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/profile/i);
  });

  it('removes the session when its stories could not be stored', async () => {
    queue('session_log', { data: null, error: null });
    queue('user_story', { data: pool, error: null });
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_user_story', { data: null, error: { message: 'insert failed' } });

    const response = await POST(req());

    expect(response.status).toBe(500);
    // Otherwise the empty session would block every future start via uq_session_log_one_active.
    expect(h.state.deletes).toContain('session_log');
  });
});
