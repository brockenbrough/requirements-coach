import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely. Same harness as
// __tests__/api/sessions.test.ts, with two additions: eq()/in() are recorded rather than no-ops,
// because "only rows whose student has role 'student'" and "only this instructor's own mcq
// activity types" are acceptance criteria of this endpoint and an ignored filter would let a
// wrong one pass unnoticed (the same reason __tests__/lib/instructorAuth.test.ts records its
// filters).
const h = vi.hoisted(() => {
  const state = {
    selects: [] as { table: string; columns: string }[],
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { table: string; column: string; value: unknown }[],
    orders: [] as { table: string; column: string; ascending: boolean }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: (columns: string) => {
        state.selects.push({ table, columns });
        return builder;
      },
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      // Recorded like eq() rather than a no-op: scoping session_log to this instructor's own
      // owned mcq activity types is an acceptance criterion, not incidental — an ignored filter
      // would let a regression back in unnoticed.
      in: (column: string, value: unknown) => {
        state.filters.push({ table, column: `${column} (in)`, value });
        return builder;
      },
      range: () => builder,
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

import { GET } from '../../app/api/instructor/activities/route';

/** The guard's own lookup: requireInstructor reads the caller's role from "user" first. */
function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

/**
 * listOwnedActivityTypeSummaries' query — one activity_type round trip, both grading kinds at
 * once. Must be queued before session_log in every test that expects session_log to actually be
 * reached, since an un-queued table resolves to { data: null } and the route short-circuits on
 * that (via mcqTypes ending up empty).
 */
function queueOwnedActivityTypeSummaries(
  summaries: { activityType: string; name: string; gradingKind: 'mcq' | 'llm-graded' }[],
) {
  queue('activity_type', {
    data: summaries.map((s) => ({ activity_type: s.activityType, quiz_name: s.name, grading_kind: s.gradingKind })),
    error: null,
  });
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
  return new Request('http://localhost/api/instructor/activities', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
  h.state.selects = [];
  h.state.orders = [];
});

describe('GET /api/instructor/activities', () => {
  it('returns every student’s attempts, with studentId and studentName on each', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
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
    queue('session_to_question', {
      data: [
        { session_id: 'session-1', position: 1, question_id: 'q1' },
        { session_id: 'session-1', position: 2, question_id: 'q2' },
        { session_id: 'session-2', position: 1, question_id: 'q3' },
      ],
      error: null,
    });
    queue('answered_question_log', {
      data: [
        { session_id: 'session-1', question_id: 'q1' },
        { session_id: 'session-1', question_id: 'q2' },
      ],
      error: null,
    });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toHaveLength(2);

    expect(body.sessions[0]).toMatchObject({
      session_id: 'session-1',
      studentId: 'student-1',
      studentName: 'Alex Chen',
      questionCount: 2,
      answeredCount: 2,
      nextPosition: null,
    });

    // All three statuses share one timeline — an in-progress row is not filtered out.
    expect(body.sessions[1]).toMatchObject({
      session_id: 'session-2',
      studentId: 'student-2',
      studentName: 'Jordan Smith',
      status: 'in-progress',
      questionCount: 1,
      answeredCount: 0,
      nextPosition: 1,
    });
  });

  // GitHub #474: the Instructor Dashboard's activity log needs to show which course(s) each
  // attempt's catalog is linked to.
  it('attaches every course each session’s catalog is linked to', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          assembled_quiz: { course_id: 'course-1', course: { course_name: 'Requirements 101' } },
        },
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          assembled_quiz: { course_id: 'course-2', course: { course_name: 'Requirements 201' } },
        },
      ],
      error: null,
    });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(body.sessions[0].courses).toEqual([
      { courseId: 'course-1', courseName: 'Requirements 101' },
      { courseId: 'course-2', courseName: 'Requirements 201' },
    ]);
  });

  it('reports an empty courses list for a catalog not linked to any course yet', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });
    queue('assembled_quiz_catalog', { data: [], error: null });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(body.sessions[0].courses).toEqual([]);
    expect(body.sessions[0].quizName).toBeNull();
  });

  // GitHub #500 follow-up: the combined instructor table's QUIZ column reads this instead of
  // falling back to the raw activity_type key — the assembled quiz's own name, not the catalog's.
  it("attaches the assembled quiz's own name, distinct from the catalog's quiz_name", async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Week 3 Quiz', course: { course_name: 'Requirements 101' } },
        },
      ],
      error: null,
    });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(body.sessions[0].quizName).toBe('Week 3 Quiz');
  });

  it('returns the instructor’s owned activity types alongside the sessions', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' },
    ]);
    queue('session_log', { data: [], error: null });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(body.ownedActivityTypes).toEqual([
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' },
    ]);
  });

  it('does not leak the joined "user" row into the response', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    // role and username are inputs to the query, not part of what the endpoint discloses.
    expect(body.sessions[0]).not.toHaveProperty('student');
    expect(JSON.stringify(body)).not.toContain('achen');
  });

  it('serves no question prompts, options, is_correct or explanation', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(body.sessions[0]).not.toHaveProperty('questions');
    expect(JSON.stringify(body)).not.toMatch(/is_correct|explanation|question_prompt/);
  });

  it('filters to role student, so an instructor’s own sessions stay out of their report', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: [], error: null });

    await GET(request('valid-token'));

    expect(h.state.filters).toContainEqual({ table: 'session_log', column: 'student.role', value: 'student' });
  });

  it('scopes activity_type to this instructor’s own creator_id', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([]);

    await GET(request('valid-token'));

    expect(h.state.filters).toContainEqual({ table: 'activity_type', column: 'creator_id', value: 'instructor-1' });
  });

  // app/instructor/page.tsx (GitHub #276) already merges this route's response with
  // GET /api/instructor/acceptance-criteria/submissions client-side. WRITE_ACCEPTANCE_CRITERIA
  // (and any future llm-graded catalog) sessions have real session_log rows too, so this query
  // must keep excluding them — otherwise every AC attempt would render twice on the combined
  // dashboard. Only the mcq-kind subset of ownedActivityTypes ever reaches session_log's
  // .in(...) filter, so an llm-graded catalog can never enter it, even if the instructor owns one.
  it('scopes session_log to only the mcq-kind owned types, carrying them through as .in(...)', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([
      { activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' },
      { activityType: 'WRITE_STRONG_USER_STORIES', name: 'Write Strong User Stories', gradingKind: 'mcq' },
      { activityType: 'MY_LLM_CATALOG', name: 'My LLM Catalog', gradingKind: 'llm-graded' },
    ]);
    queue('session_log', { data: [], error: null });

    await GET(request('valid-token'));

    expect(h.state.filters).toContainEqual({
      table: 'session_log',
      column: 'activity_type (in)',
      value: ['IDENTIFY_WEAK_USER_STORIES', 'WRITE_STRONG_USER_STORIES'],
    });

    expect(h.state.filters).not.toContainEqual(
      expect.objectContaining({ column: 'activity_type (neq)' }),
    );
  });

  it('answers 200 with sessions: [], without ever querying session_log, when the instructor owns only llm-graded types — but still reports them in ownedActivityTypes', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'MY_LLM_CATALOG', name: 'My LLM Catalog', gradingKind: 'llm-graded' }]);

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toEqual([]);
    expect(body.ownedActivityTypes).toEqual([{ activityType: 'MY_LLM_CATALOG', name: 'My LLM Catalog', gradingKind: 'llm-graded' }]);
    expect(h.state.tables).not.toContain('session_log');
  });

  it('sorts in the query: ended_at desc, then started_at desc', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: [], error: null });

    await GET(request('valid-token'));

    const sessionOrders = h.state.orders.filter((order) => order.table === 'session_log');

    // started_at second is what keeps running sessions (ended_at IS NULL, and therefore first
    // under Postgres' DESC NULLS FIRST) in a stable order among themselves.
    expect(sessionOrders).toEqual([
      { table: 'session_log', column: 'ended_at', ascending: false },
      { table: 'session_log', column: 'started_at', ascending: false },
    ]);
  });

  it('falls back to the username when the profile has no first/last name', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', {
      data: [sessionRow({ student: { first_name: null, last_name: null, username: 'quiet-owl', role: 'student' } })],
      error: null,
    });
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(body.sessions[0].studentName).toBe('quiet-owl');
  });

  it('answers 200 with an empty list for a class that has not started anything', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: [], error: null });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sessions).toEqual([]);
    // loadProgressForSessions short-circuits on an empty id list rather than querying for nothing.
    expect(h.state.tables).not.toContain('session_to_question');
  });

  it('answers 200 with an empty list, without ever querying session_log, when the instructor owns no activity types at all', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([]);

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ sessions: [], ownedActivityTypes: [] });
    expect(h.state.tables).not.toContain('session_log');
  });

  it('rejects a student with 403 and an empty body, before reading any session', async () => {
    queueRole('student');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: [sessionRow()], error: null });

    const response = await GET(request('valid-token'));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    // The guard runs before any data is touched — the queued rows are never reached.
    expect(h.state.tables).not.toContain('session_log');
  });

  it('rejects an account without a profile row, which has never been confirmed as an instructor', async () => {
    queue('user', { data: null, error: null });

    const response = await GET(request('valid-token'));

    expect(response.status).toBe(403);
    expect(h.state.tables).not.toContain('session_log');
  });

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
    expect(h.state.tables).not.toContain('session_log');
  });

  it('answers 500 when the owned-activity-type lookup fails, without querying session_log', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: { message: 'boom' } });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
    expect(h.state.tables).not.toContain('session_log');
  });

  it('answers 500 when the session query fails', async () => {
    queueRole('instructor');
    queueOwnedActivityTypeSummaries([{ activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' }]);
    queue('session_log', { data: null, error: { message: 'boom' } });

    const response = await GET(request('valid-token'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
  });
});
