import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
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

import { GET } from '../../app/api/students/[studentId]/activities/route';

const STUDENT_ID = 'user-123';

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 'session-1',
    user_id: STUDENT_ID,
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    difficulty_level: 1,
    started_at: '2026-07-29T10:00:00.000Z',
    ended_at: null,
    status: 'in-progress',
    cumulative_score: 50,
    max_score: 100,
    passed: false,
    badge_id: null,
    ...overrides,
  };
}

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/students/${STUDENT_ID}/activities`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const ctx = { params: { studentId: STUDENT_ID } };

/** Queues session_log rows followed by the two progress tables (Promise.all order). */
function queueLookup(sessionRows: unknown[], progressRows: { toQuestion?: unknown[]; answered?: unknown[] } = {}) {
  queue('session_log', { data: sessionRows, error: null });
  if (sessionRows.length > 0) {
    queue('session_to_question', { data: progressRows.toQuestion ?? [], error: null });
    queue('answered_question_log', { data: progressRows.answered ?? [], error: null });
  }
}

describe('GET /api/students/{studentId}/activities', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
  });

  it('returns 401 without a token', async () => {
    const response = await GET(req(null), ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('bad-token'), ctx);
    expect(response.status).toBe(401);
  });

  // Only the requesting student's own log is ever returned.
  it("returns 403 for a studentId that is not the requesting student's", async () => {
    const response = await GET(req(), { params: { studentId: 'someone-else' } });

    expect(response.status).toBe(403);
    expect(h.state.tables).not.toContain('session_log');
  });

  it('returns an empty array when the student has no session history', async () => {
    queueLookup([]);

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activities).toEqual([]);
    // loadProgressForSessions short-circuits on an empty id list.
    expect(h.state.tables).not.toContain('session_to_question');
  });

  it('merges every status onto one timeline, newest-relevant-timestamp first', async () => {
    queueLookup([
      sessionRow({ session_id: 'in-progress-1', status: 'in-progress', ended_at: null, started_at: '2026-08-01T10:00:00.000Z' }),
      sessionRow({ session_id: 'completed-1', status: 'completed', ended_at: '2026-07-25T10:00:00.000Z', started_at: '2026-07-20T10:00:00.000Z' }),
      sessionRow({ session_id: 'abandoned-1', status: 'abandoned', ended_at: '2026-07-30T10:00:00.000Z', started_at: '2026-07-28T10:00:00.000Z' }),
    ]);

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.activities.map((a: { session_id: string }) => a.session_id)).toEqual([
      'in-progress-1',
      'abandoned-1',
      'completed-1',
    ]);
  });

  it('includes progress alongside each session', async () => {
    queueLookup(
      [sessionRow({ session_id: 'session-1' })],
      {
        toQuestion: [
          { session_id: 'session-1', position: 0, question_id: 'q-1' },
          { session_id: 'session-1', position: 1, question_id: 'q-2' },
        ],
        answered: [{ session_id: 'session-1', question_id: 'q-1' }],
      },
    );

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(body.activities[0]).toMatchObject({
      questionCount: 2,
      answeredCount: 1,
      nextPosition: 1,
    });
  });

  it('returns 500 when the session_log query fails', async () => {
    queue('session_log', { data: null, error: { message: 'db down' } });

    const response = await GET(req(), ctx);

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('db down');
  });

  it('returns 500 when the progress query fails', async () => {
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', { data: null, error: { message: 'boom' } });
    queue('answered_question_log', { data: [], error: null });

    const response = await GET(req(), ctx);

    expect(response.status).toBe(500);
  });
});
