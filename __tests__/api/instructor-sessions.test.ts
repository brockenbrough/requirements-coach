import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same harness as __tests__/api/instructor-activities.test.ts: eq() and order() are recorded,
// not no-ops, since "only role student, newest first" are acceptance criteria here and an
// ignored filter would let a wrong one pass unnoticed.
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

import { GET } from '../../app/api/instructor/sessions/route';

/** requireInstructor's own lookup: the caller's role, read from "user" first. */
function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function sessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    session_id: 'session-1',
    user_id: 'student-1',
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    difficulty_level: 1,
    started_at: '2026-08-01T10:00:00.000Z',
    ended_at: '2026-08-01T10:20:00.000Z',
    status: 'completed',
    cumulative_score: 75,
    max_score: 100,
    passed: false,
    student: { first_name: 'Alex', last_name: 'Chen', username: 'achen', role: 'student' },
    ...overrides,
  };
}

function request(token?: string) {
  return new Request('http://localhost/api/instructor/sessions', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
  h.state.orders = [];
});

describe('GET /api/instructor/sessions', () => {
  it('answers 401 without a token', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(h.state.tables).toEqual([]);
  });

  it('answers 401 for an invalid token', async () => {
    const response = await GET(request('bad-token'));
    expect(response.status).toBe(401);
  });

  it('rejects a student with 403 and an empty body, before reading any session', async () => {
    queueRole('student');
    queue('session_log', { data: [sessionRow()], error: null });

    const response = await GET(request('valid-token'));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(h.state.tables).not.toContain('session_log');
  });

  it('rejects an account without a profile row, which has never been confirmed as an instructor', async () => {
    queue('user', { data: null, error: null });

    const response = await GET(request('valid-token'));

    expect(response.status).toBe(403);
    expect(h.state.tables).not.toContain('session_log');
  });

  it('returns every session with the student and record fields the AC asks for', async () => {
    queueRole('instructor');
    queue('session_log', {
      data: [
        sessionRow(),
        sessionRow({
          session_id: 'session-2',
          user_id: 'student-2',
          status: 'in-progress',
          ended_at: null,
          cumulative_score: 25,
          student: { first_name: 'Jordan', last_name: 'Smith', username: 'jsmith', role: 'student' },
        }),
      ],
      error: null,
    });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0]).toEqual({
      session_id: 'session-1',
      user_id: 'student-1',
      activity_type: 'IDENTIFY_WEAK_USER_STORIES',
      difficulty_level: 1,
      started_at: '2026-08-01T10:00:00.000Z',
      ended_at: '2026-08-01T10:20:00.000Z',
      status: 'completed',
      cumulative_score: 75,
      max_score: 100,
      passed: false,
      studentId: 'student-1',
      studentName: 'Alex Chen',
    });
  });

  it('does not leak the joined "user" row, or fetch progress, into the response', async () => {
    queueRole('instructor');
    queue('session_log', { data: [sessionRow()], error: null });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(body.sessions[0]).not.toHaveProperty('student');
    expect(body.sessions[0]).not.toHaveProperty('questionCount');
    expect(JSON.stringify(body)).not.toContain('achen');
    // No progress lookup — this endpoint's AC never asks how far into the session it got.
    expect(h.state.tables).not.toContain('session_to_question');
    expect(h.state.tables).not.toContain('answered_question_log');
  });

  it('filters to role student, so an instructor’s own sessions stay out', async () => {
    queueRole('instructor');
    queue('session_log', { data: [], error: null });

    const response = await GET(request('valid-token'));

    expect(response.status).toBe(404);
    expect(h.state.filters).toContainEqual({ table: 'session_log', column: 'student.role', value: 'student' });
  });

  it('orders newest first by started_at', async () => {
    queueRole('instructor');
    queue('session_log', { data: [sessionRow()], error: null });

    await GET(request('valid-token'));

    expect(h.state.orders).toContainEqual({ table: 'session_log', column: 'started_at', ascending: false });
  });

  it('falls back to the username when the profile has no first/last name', async () => {
    queueRole('instructor');
    queue('session_log', {
      data: [sessionRow({ student: { first_name: null, last_name: null, username: 'quiet-owl', role: 'student' } })],
      error: null,
    });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(body.sessions[0].studentName).toBe('quiet-owl');
  });

  it('returns 404 when there are no session_log records at all', async () => {
    queueRole('instructor');
    queue('session_log', { data: [], error: null });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/no sessions/i);
  });

  it('returns 500 when the session query fails', async () => {
    queueRole('instructor');
    queue('session_log', { data: null, error: { message: 'boom' } });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
  });
});
