import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same harness as __tests__/api/instructor-activities.test.ts: eq() and order() are recorded,
// not no-ops, since "only this student, only completed, newest first" are acceptance criteria
// here and an ignored filter would let a wrong one pass unnoticed.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { table: string; column: string; value: unknown }[],
    orders: [] as { table: string; column: string; ascending: boolean }[],
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

// GitHub #525: wrapping (not replacing) the real implementation lets every existing test keep
// exercising real isActivityType behavior against the mocked supabase client above, while this
// file can also assert on what arguments the route actually passed it.
vi.mock('../../lib/activityTypes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/activityTypes')>();
  return { ...actual, isActivityType: vi.fn(actual.isActivityType) };
});

import { isActivityType } from '../../lib/activityTypes';
import { GET } from '../../app/api/instructor/students/[studentId]/history/route';

const STUDENT_ID = 'student-1';

/** requireInstructor's own lookup: the caller's role, read from "user" first. */
function queueCallerRole(role: string) {
  queue('user', { data: { role }, error: null });
}

/** The route's own existence check: the target student's row, read from "user" second. */
function queueStudent(exists = true) {
  queue('user', exists ? { data: { user_id: STUDENT_ID }, error: null } : { data: null, error: null });
}

function req(query = '', token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/instructor/students/${STUDENT_ID}/history${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const PARAMS = { params: { studentId: STUDENT_ID } };

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
  h.state.orders = [];
  vi.mocked(isActivityType).mockClear();
});

describe('GET /api/instructor/students/:studentId/history', () => {
  it('returns 401 without a token', async () => {
    const response = await GET(req('', null), PARAMS);
    expect(response.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('', 'bad-token'), PARAMS);
    expect(response.status).toBe(401);
  });

  it('rejects a student caller with 403 and an empty body, before touching any data', async () => {
    queueCallerRole('student');

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(h.state.tables).toEqual(['user']);
  });

  it('returns 400 for an unknown activityType', async () => {
    queueCallerRole('instructor');

    const response = await GET(req('?activityType=NOT_A_REAL_ACTIVITY'), PARAMS);

    expect(response.status).toBe(400);
    // Rejected before the existence check or any session_log read — the activity_type lookup
    // itself still ran (GitHub #347: isActivityType is now a DB read), it just found nothing.
    expect(h.state.tables).toEqual(['user', 'activity_type']);
  });

  it('returns 404 when the student does not exist', async () => {
    queueCallerRole('instructor');
    queueStudent(false);

    const response = await GET(req(), PARAMS);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
    expect(h.state.tables).not.toContain('session_log');
  });

  it('returns 404 for an id that belongs to an instructor, not a student', async () => {
    queueCallerRole('instructor');
    // The target-lookup filters on role = 'student', so an instructor id comes back empty.
    queueStudent(false);

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(404);
    expect(h.state.filters).toContainEqual({ table: 'user', column: 'role', value: 'student' });
  });

  it('returns completed sessions with the fields the AC asks for', async () => {
    queueCallerRole('instructor');
    queueStudent();
    queue('session_log', {
      data: [
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          difficulty_level: 1,
          cumulative_score: 100,
          max_score: 100,
          passed: true,
          ended_at: '2026-08-03T10:00:00Z',
        },
      ],
      error: null,
    });

    const response = await GET(req(), PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toEqual({
      activity_type: 'IDENTIFY_WEAK_USER_STORIES',
      difficulty_level: 1,
      cumulative_score: 100,
      max_score: 100,
      passed: true,
      ended_at: '2026-08-03T10:00:00Z',
    });
  });

  it('only returns completed sessions for the requested student, newest first', async () => {
    queueCallerRole('instructor');
    queueStudent();
    queue('session_log', { data: [], error: null });

    await GET(req(), PARAMS);

    expect(h.state.filters).toContainEqual({ table: 'session_log', column: 'user_id', value: STUDENT_ID });
    expect(h.state.filters).toContainEqual({ table: 'session_log', column: 'status', value: 'completed' });
    expect(h.state.orders).toContainEqual({ table: 'session_log', column: 'ended_at', ascending: false });
  });

  it('filters by activity type when the query parameter is given', async () => {
    queueCallerRole('instructor');
    queue('activity_type', { data: { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA' }, error: null });
    queueStudent();
    queue('session_log', { data: [], error: null });

    await GET(req('?activityType=IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'), PARAMS);

    expect(h.state.filters).toContainEqual({
      table: 'session_log',
      column: 'activity_type',
      value: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA',
    });
  });

  it('does not filter by activity type when the query parameter is absent', async () => {
    queueCallerRole('instructor');
    queueStudent();
    queue('session_log', { data: [], error: null });

    await GET(req(), PARAMS);

    expect(h.state.filters.filter((f) => f.table === 'session_log')).not.toContainEqual(
      expect.objectContaining({ column: 'activity_type' }),
    );
  });

  it('returns an empty array when the student has no completed sessions', async () => {
    queueCallerRole('instructor');
    queueStudent();
    queue('session_log', { data: [], error: null });

    const response = await GET(req(), PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toEqual([]);
  });

  // GitHub #525: an instructor filtering a student's history by a since-deleted catalog must
  // still get results, not a 400 — this route is one of the explicit includeDeleted opt-ins.
  it('resolves a soft-deleted catalog too, when filtering history by activity type', async () => {
    queueCallerRole('instructor');
    queue('activity_type', { data: { activity_type: 'IDENTIFY_WEAK_USER_STORIES' }, error: null });
    queueStudent();
    queue('session_log', { data: [], error: null });

    await GET(req('?activityType=IDENTIFY_WEAK_USER_STORIES'), PARAMS);

    expect(isActivityType).toHaveBeenCalledWith(expect.anything(), 'IDENTIFY_WEAK_USER_STORIES', {
      includeDeleted: true,
    });
  });

  it('returns 500 when the session query fails', async () => {
    queueCallerRole('instructor');
    queueStudent();
    queue('session_log', { data: null, error: { message: 'boom' } });

    const response = await GET(req(), PARAMS);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
  });

  it('returns 500 when the student existence check fails', async () => {
    queueCallerRole('instructor');
    queue('user', { data: null, error: { message: 'boom' } });

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(500);
  });
});
