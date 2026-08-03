import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    // Which rows the titles are built from is the whole definition of the response, so the
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

import { GET } from '../../app/api/students/[studentId]/titles/route';

const STUDENT_ID = 'user-123';

const titleDefinitions = [
  { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, title_name: 'Story Apprentice' },
  { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 2, title_name: 'Story Analyst' },
  { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 3, title_name: 'Story Expert' },
  { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficulty_level: 1, title_name: 'Criteria Apprentice' },
  { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficulty_level: 2, title_name: 'Criteria Analyst' },
  { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficulty_level: 3, title_name: 'Criteria Expert' },
];

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/students/${STUDENT_ID}/titles`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const ctx = { params: { studentId: STUDENT_ID } };

/** Queues session_log rows followed by the title_definition table (Promise.all order). */
function queueLookup(sessionRows: unknown[]) {
  queue('session_log', { data: sessionRows, error: null });
  queue('title_definition', { data: titleDefinitions, error: null });
}

describe('GET /api/students/{studentId}/titles', () => {
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

  // AC 5: only the requesting student's own titles are ever returned.
  it("returns 403 for a studentId that is not the requesting student's", async () => {
    const response = await GET(req(), { params: { studentId: 'someone-else' } });

    expect(response.status).toBe(403);
    expect(h.state.tables).not.toContain('session_log');
  });

  // AC 4: no session history at all.
  it('returns an empty array when the student has no session history', async () => {
    queueLookup([]);

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.titles).toEqual([]);
  });

  // REQ-GAM-BL-1.1 scopes the session lookup to the requesting student; title_definition is
  // the same for everyone, so it is fetched unfiltered.
  it('scopes the session_log query to the requesting student', async () => {
    queueLookup([]);

    await GET(req(), ctx);

    expect(h.state.filters).toEqual([{ table: 'session_log', column: 'user_id', value: STUDENT_ID }]);
  });

  // AC 3: attempted but never passed.
  it('returns "Not yet started" for an activity type with no passed session', async () => {
    queueLookup([
      { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, passed: false },
    ]);

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.titles).toEqual([
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: null, title: 'Not yet started' },
    ]);
  });

  // AC 2: highest passed level wins, looked up against title_definition.
  it('returns the title for the highest difficulty level passed', async () => {
    queueLookup([
      { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, passed: true },
      { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 2, passed: true },
      { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 3, passed: false },
    ]);

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.titles).toEqual([
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 2, title: 'Story Analyst' },
    ]);
  });

  // AC 1: one entry per attempted activity type, in canonical order.
  it('returns one entry per attempted activity type', async () => {
    queueLookup([
      { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficulty_level: 1, passed: true },
      { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 3, passed: true },
    ]);

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.titles).toEqual([
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 3, title: 'Story Expert' },
      { activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', difficultyLevel: 1, title: 'Criteria Apprentice' },
    ]);
  });

  it('returns 500 when the session_log query fails', async () => {
    queue('session_log', { data: null, error: { message: 'db down' } });
    queue('title_definition', { data: titleDefinitions, error: null });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });
});
