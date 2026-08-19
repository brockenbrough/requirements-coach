import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    // Which rows the sum is built from is the whole definition of this number, so the
    // filters are recorded rather than swallowed.
    filters: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
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

import { GET } from '../../app/api/students/[studentId]/score/route';

const STUDENT_ID = 'user-123';

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/students/${STUDENT_ID}/score`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const ctx = { params: { studentId: STUDENT_ID } };

describe('GET /api/students/{studentId}/score', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
    h.state.filters = [];
  });

  it('returns 401 without a token', async () => {
    const response = await GET(req(null), ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('bad-token'), ctx);
    expect(response.status).toBe(401);
  });

  // AC 4: only the requesting student's own score is ever returned.
  it("returns 403 for a studentId that is not the requesting student's", async () => {
    const response = await GET(req(), { params: { studentId: 'someone-else' } });

    expect(response.status).toBe(403);
    expect(h.state.tables).not.toContain('session_log');
  });

  // AC 3: no completed sessions at all.
  it('returns 0 when the student has no completed sessions', async () => {
    queue('session_log', { data: [], error: null });
    queue('daily_challenge_attempt', { data: [], error: null });

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.score).toBe(0);
    expect(body.sessionsCompleted).toBe(0);
  });

  // GitHub #39: sessionsCompleted is the row count behind the same query the score is summed
  // from — every completed session counts once here, even though a weaker retake at the same
  // level doesn't raise the score.
  it('counts every completed session for sessionsCompleted, including a weaker retake', async () => {
    queue('session_log', {
      data: [
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 100 },
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 75 },
        { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficulty_level: 1, cumulative_score: 50 },
      ],
      error: null,
    });

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.score).toBe(150); // best-per-level sum: 100 + 50
    expect(body.sessionsCompleted).toBe(3); // every completed session counts
  });

  // REQ-GAM-DL-1 counts completed sessions, not passed ones: the query filters on status,
  // so a running or abandoned attempt never reaches the sum, while a finished-but-failed
  // one keeps the points it earned.
  it('scopes the queries to the student, and session_log additionally to completed sessions', async () => {
    queue('session_log', { data: [], error: null });
    queue('daily_challenge_attempt', { data: [], error: null });

    await GET(req(), ctx);

    expect(h.state.filters).toEqual([
      { table: 'session_log', column: 'user_id', value: STUDENT_ID },
      { table: 'session_log', column: 'status', value: 'completed' },
      { table: 'daily_challenge_attempt', column: 'user_id', value: STUDENT_ID },
    ]);
  });

  // A completed attempt below the 75% pass mark still contributes — passing is not the filter.
  it('counts a completed session that was not passed', async () => {
    queue('session_log', {
      data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 50 }],
      error: null,
    });

    const body = await (await GET(req(), ctx)).json();

    expect(body.score).toBe(50);
  });

  it('sums the completed sessions returned by the query', async () => {
    queue('session_log', {
      data: [
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 80 },
        { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficulty_level: 1, cumulative_score: 100 },
      ],
      error: null,
    });

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.score).toBe(180);
  });

  // AC 1: the best score per (activity_type, difficulty_level) — a retake that scores
  // higher raises the total, but the level is not double-counted.
  it('counts only the best score per activity type and difficulty level', async () => {
    queue('session_log', {
      data: [
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 75 },
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 100 },
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 90 },
      ],
      error: null,
    });

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.score).toBe(100);
  });

  // Different difficulty levels of the same activity type each contribute their own best score.
  it('sums best scores across difficulty levels of the same activity type', async () => {
    queue('session_log', {
      data: [
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 100 },
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 2, cumulative_score: 100 },
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 3, cumulative_score: 75 },
      ],
      error: null,
    });

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.score).toBe(275);
  });

  // A submitted Daily Challenge attempt's already-doubled score (lib/dailyChallengeRules.ts's
  // scoreForDailyChallenge) is added on top of the session-derived total.
  it('adds a submitted Daily Challenge attempt score to the total', async () => {
    queue('session_log', {
      data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 100 }],
      error: null,
    });
    queue('daily_challenge_attempt', { data: [{ score: 40 }], error: null });

    const body = await (await GET(req(), ctx)).json();

    expect(body.score).toBe(140);
  });

  // Every day's attempt is its own row (uq_daily_challenge_attempt_user_date caps it at one per
  // day) — unlike sessions there's no (activity_type, difficulty_level) to dedupe on, so every
  // submitted attempt's score is summed, not just the best.
  it('sums Daily Challenge scores across multiple days rather than keeping only the best', async () => {
    queue('session_log', { data: [], error: null });
    queue('daily_challenge_attempt', { data: [{ score: 20 }, { score: 40 }, { score: 10 }], error: null });

    const body = await (await GET(req(), ctx)).json();

    expect(body.score).toBe(70);
  });

  // A `null` score means the attempt was never submitted (deadline passed first, see the table's
  // own doc comment in supabase/schema.sql) — it must contribute 0, not throw or count as points.
  it('treats an unsubmitted Daily Challenge attempt (null score) as contributing 0', async () => {
    queue('session_log', { data: [], error: null });
    queue('daily_challenge_attempt', { data: [{ score: null }], error: null });

    const body = await (await GET(req(), ctx)).json();

    expect(body.score).toBe(0);
  });

  // Daily Challenge attempts are not sessions and must not inflate sessionsCompleted (GitHub #39),
  // which is defined purely off the session_log row count.
  it('does not count Daily Challenge attempts toward sessionsCompleted', async () => {
    queue('session_log', { data: [], error: null });
    queue('daily_challenge_attempt', { data: [{ score: 40 }], error: null });

    const body = await (await GET(req(), ctx)).json();

    expect(body.sessionsCompleted).toBe(0);
  });

  it('returns 500 when the session_log query fails', async () => {
    queue('session_log', { data: null, error: { message: 'db down' } });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });

  it('returns 500 when the daily_challenge_attempt query fails', async () => {
    queue('session_log', { data: [], error: null });
    queue('daily_challenge_attempt', { data: null, error: { message: 'db down' } });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });

  // GitHub #392: the route always recomputes from session_log rather than reading a stored
  // total, so a freshly completed, passed session is reflected the moment it's queried again —
  // no separate "refresh" step is needed on the server side. This is what makes the client-side
  // fix (lib/scoreStore.ts's cache must be invalidated after a session finishes, which is what
  // was actually broken for the LLM-graded play flow) sufficient on its own: once the client
  // asks again, the server was never the stale part.
  it('reflects a newly completed, passed session added since the last read', async () => {
    queue('session_log', {
      data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 75 }],
      error: null,
    });
    const before = await (await GET(req(), ctx)).json();
    expect(before.score).toBe(75);
    expect(before.sessionsCompleted).toBe(1);

    // The student just finished another session — a new difficulty level, passed — which lands
    // in session_log as status: 'completed' before the client ever re-asks this route.
    queue('session_log', {
      data: [
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 75 },
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 2, cumulative_score: 90 },
      ],
      error: null,
    });
    const after = await (await GET(req(), ctx)).json();
    expect(after.score).toBe(165); // 75 + 90, the new session's points are added, not dropped
    expect(after.sessionsCompleted).toBe(2);
  });
});
