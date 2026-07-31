import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    updates: [] as { table: string; payload: unknown }[],
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      update: (payload: unknown) => {
        state.updates.push({ table, payload });
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

import { POST } from '../../app/api/sessions/[sessionId]/abandon/route';

const SESSION_ID = 'session-1';

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: SESSION_ID,
    user_id: 'user-123',
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    difficulty_level: 1,
    started_at: '2026-07-29T10:00:00.000Z',
    ended_at: null,
    status: 'in-progress',
    cumulative_score: 25,
    max_score: 100,
    passed: false,
    badge_id: null,
    ...overrides,
  };
}

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/sessions/${SESSION_ID}/abandon`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const ctx = { params: { sessionId: SESSION_ID } };

describe('POST /api/sessions/{sessionId}/abandon', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.updates = [];
    h.state.tables = [];
  });

  it('returns 401 without a token', async () => {
    const response = await POST(req(null), ctx);

    expect(response.status).toBe(401);
    // Nothing was even looked up, let alone written.
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await POST(req('bad-token'), ctx);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid or expired token.' });
  });

  it('returns 404 when the session does not exist', async () => {
    queue('session_log', { data: null, error: null });

    const response = await POST(req(), ctx);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Session not found.' });
    expect(h.state.updates).toEqual([]);
  });

  it('returns 404 for a session belonging to another student', async () => {
    // The ownership check lives in the query (.eq('user_id', user.id)), so a foreign session
    // comes back as no row at all — indistinguishable from one that does not exist, which is
    // the point: the status code must not confirm that the id is real.
    queue('session_log', { data: null, error: null });

    const response = await POST(req(), ctx);

    expect(response.status).toBe(404);
    expect(h.state.updates).toEqual([]);
  });

  it('returns 500 when the session lookup fails', async () => {
    queue('session_log', { data: null, error: { message: 'db down' } });

    const response = await POST(req(), ctx);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'db down' });
  });

  it('returns 409 for a completed session', async () => {
    queue('session_log', { data: sessionRow({ status: 'completed' }), error: null });

    const response = await POST(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('Session is completed.');
    expect(body.session.status).toBe('completed');
    // A finished session must not be rewritten.
    expect(h.state.updates).toEqual([]);
  });

  it('returns 409 for a session that is already abandoned', async () => {
    queue('session_log', { data: sessionRow({ status: 'abandoned' }), error: null });

    const response = await POST(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('Session is abandoned.');
    expect(h.state.updates).toEqual([]);
  });

  it('marks an in-progress session as abandoned and returns it', async () => {
    queue('session_log', { data: sessionRow(), error: null });
    queue('session_log', {
      data: sessionRow({ status: 'abandoned', ended_at: '2026-07-31T12:00:00.000Z' }),
      error: null,
    });

    const response = await POST(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.status).toBe('abandoned');
    expect(body.session.ended_at).toBe('2026-07-31T12:00:00.000Z');
  });

  it('writes only status and ended_at', async () => {
    queue('session_log', { data: sessionRow(), error: null });
    queue('session_log', { data: sessionRow({ status: 'abandoned' }), error: null });

    await POST(req(), ctx);

    expect(h.state.updates).toHaveLength(1);
    const payload = h.state.updates[0].payload as Record<string, unknown>;

    expect(payload.status).toBe('abandoned');
    expect(typeof payload.ended_at).toBe('string');
    // The score earned so far stays as history, and abandoning never counts as passing.
    expect(payload).not.toHaveProperty('cumulative_score');
    expect(payload).not.toHaveProperty('passed');
  });

  it('returns 500 when the update fails', async () => {
    queue('session_log', { data: sessionRow(), error: null });
    queue('session_log', { data: null, error: { message: 'update failed' } });

    const response = await POST(req(), ctx);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'update failed' });
  });

  it('returns 409 when the session was completed in parallel', async () => {
    queue('session_log', { data: sessionRow(), error: null });
    // The guarded update matches no row, because the last answer landed first.
    queue('session_log', { data: null, error: null });
    queue('session_log', { data: sessionRow({ status: 'completed' }), error: null });

    const response = await POST(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('Session is completed.');
    expect(body.session.status).toBe('completed');
  });
});
