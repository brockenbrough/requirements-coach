import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
  };

  function makeBuilder(result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      range: () => builder,
      order: () => builder,
      maybeSingle: async () => result,
      single: async () => result,
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
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(result);
    },
  }),
}));

import { GET } from '../../app/api/instructor/courses/[id]/export/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function courseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    course_id: 'course-1',
    course_name: 'Software Requirements',
    course_code: 'ABCDEF',
    creator_id: 'instructor-1',
    created_at: '2026-08-11T10:00:00',
    ...overrides,
  };
}

function sessionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    session_id: 'session-1',
    user_id: 'student-1',
    activity_type: 'IDENTIFY_WEAK_USER_STORIES',
    difficulty_level: 1,
    started_at: '2026-08-01T10:00:00',
    ended_at: '2026-08-01T10:10:00',
    status: 'completed',
    cumulative_score: 3,
    max_score: 4,
    passed: true,
    student: { first_name: 'Alex', last_name: 'Chen', username: 'achen', role: 'student' },
    ...overrides,
  };
}

function getRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses/course-1/export', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const params = { params: { id: 'course-1' } };

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
});

describe('GET /api/instructor/courses/[id]/export', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(getRequest(null), params);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await GET(getRequest(), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 404 when the course does not exist', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(404);
  });

  it('returns 403 with an empty body when the caller does not own the course', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow({ creator_id: 'someone-else' }), error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns a CSV identified by student id (not name), one row per question', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', {
      data: [{ user_id: 'student-1', student: { first_name: 'Alex', last_name: 'Chen', username: 'achen' } }],
      error: null,
    });
    queue('session_log', { data: [sessionRow()], error: null });
    queue('session_to_question', {
      data: [
        { session_id: 'session-1', position: 0, question_id: 'q1' },
        { session_id: 'session-1', position: 1, question_id: 'q2' },
      ],
      error: null,
    });
    queue('answered_question_log', {
      data: [{ session_id: 'session-1', question_id: 'q1', submitted_option: 'a1' }],
      error: null,
    });
    queue('session_to_user_story', { data: [], error: null });
    queue('submission', { data: [], error: null });
    queue('question', {
      data: [
        { question_id: 'q1', question_prompt: 'Which user story is weakest?' },
        { question_id: 'q2', question_prompt: 'Which user story is best?' },
      ],
      error: null,
    });
    queue('answer', { data: [{ answer_id: 'a1', option_text: 'Option A' }], error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="course-ABCDEF-report.csv"');

    const csv = await res.text();
    expect(csv).not.toMatch(/Alex|Chen|achen/);
    expect(csv).toBe(
      'userId,Catalog,difficultyLevel,status,startedAt,endedAt,cumulativeScore,maxScore,passed,questionCount,answeredCount,Question,Question Text,Answer\r\n' +
        'student-1,IDENTIFY_WEAK_USER_STORIES,1,completed,2026-08-01T10:00:00Z,2026-08-01T10:10:00Z,3,4,true,2,1,Question 1,Which user story is weakest?,Option A\r\n' +
        'student-1,IDENTIFY_WEAK_USER_STORIES,1,completed,2026-08-01T10:00:00Z,2026-08-01T10:10:00Z,3,4,true,2,1,Question 2,Which user story is best?,\r\n',
    );
  });

  it('returns just the header row when no students are enrolled', async () => {
    queueRole('instructor');
    queue('course', { data: courseRow(), error: null });
    queue('student_course', { data: [], error: null });

    const res = await GET(getRequest(), params);
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toBe(
      'userId,Catalog,difficultyLevel,status,startedAt,endedAt,cumulativeScore,maxScore,passed,questionCount,answeredCount,Question,Question Text,Answer\r\n',
    );
    expect(h.state.tables).not.toContain('session_log');
  });
});
