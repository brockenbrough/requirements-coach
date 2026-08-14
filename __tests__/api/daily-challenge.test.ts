import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely — same harness shape as
// __tests__/api/sessions.test.ts.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
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

import { GET, POST } from '../../app/api/daily-challenge/route';

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

const baseAttempt = {
  daily_challenge_attempt_id: 'attempt-1',
  user_id: 'user-123',
  question_id: 'q-1',
  challenge_date: '2026-08-14',
  started_at: '2026-08-14T10:00:00.000Z',
  deadline_at: future,
  submitted_option: null,
  is_correct: null,
  score: null,
  submitted_at: null,
};

const questionWithOptions = {
  question_id: 'q-1',
  question_prompt: 'What is a good acceptance criterion?',
  difficulty_level: 1,
  activity_type: 'IDENTIFY_WEAK_USER_STORIES',
  max_score: 25,
  question_to_answer: [
    { answer: { answer_id: 'a-1', option_text: 'Option 1' } },
    { answer: { answer_id: 'a-2', option_text: 'Option 2' } },
  ],
};

const questionPlain = {
  question_id: 'q-1',
  question_prompt: 'What is a good acceptance criterion?',
  difficulty_level: 1,
  activity_type: 'IDENTIFY_WEAK_USER_STORIES',
  max_score: 25,
};

const questionToAnswerWithSolution = [
  { answer: { answer_id: 'a-1', option_text: 'Option 1', explanation: 'Because of X.', is_correct: true } },
  { answer: { answer_id: 'a-2', option_text: 'Option 2', explanation: 'Because of Y.', is_correct: false } },
];

function req(method: 'GET' | 'POST', token: string | null = 'valid-token') {
  return new Request('http://localhost/api/daily-challenge', {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function queueNoCourses() {
  queue('daily_challenge_attempt', { data: null, error: null }); // findTodayAttempt: none yet
  queue('student_course', { data: [], error: null }); // getEnrolledCourseIds: not enrolled anywhere
}

function queueEligiblePool() {
  queue('student_course', { data: [{ course_id: 'c-1' }], error: null });
  queue('course', { data: [{ creator_id: 'instr-1' }], error: null });
  queue('question', { data: [{ question_id: 'q-1', max_score: 25 }], error: null });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.inserts = [];
  h.state.tables = [];
});

describe('GET /api/daily-challenge', () => {
  it('returns 401 without a token', async () => {
    expect((await GET(req('GET', null))).status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    expect((await GET(req('GET', 'bad-token'))).status).toBe(401);
  });

  it('reports unavailable when the student is enrolled in no courses', async () => {
    queueNoCourses();

    const body = await (await GET(req('GET'))).json();

    expect(body).toEqual({ attempt: null, available: false, question: null });
    expect(h.state.tables).toEqual(['daily_challenge_attempt', 'student_course']);
  });

  it('reports available when the enrolled courses have questions', async () => {
    queue('daily_challenge_attempt', { data: null, error: null });
    queueEligiblePool();

    const body = await (await GET(req('GET'))).json();

    expect(body).toEqual({ attempt: null, available: true, question: null });
  });

  it('returns the drawn question, undisclosed, for an in-progress attempt', async () => {
    queue('daily_challenge_attempt', { data: baseAttempt, error: null });
    queue('question', { data: questionWithOptions, error: null });

    const response = await GET(req('GET'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.expired).toBe(false);
    expect(body.attempt).toEqual(baseAttempt);
    expect(body.question.options).toHaveLength(2);
    // The attempt row itself legitimately carries a null is_correct column pre-submission — only
    // the options must withhold the solution.
    body.question.options.forEach((option: Record<string, unknown>) => {
      expect(option).not.toHaveProperty('is_correct');
      expect(option).not.toHaveProperty('explanation');
    });
  });

  it('reports expired without disclosing the question once the deadline has passed', async () => {
    queue('daily_challenge_attempt', { data: { ...baseAttempt, deadline_at: past }, error: null });

    const response = await GET(req('GET'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.expired).toBe(true);
    expect(body.question).toBeNull();
    // No question lookup for an already-expired, unsubmitted attempt.
    expect(h.state.tables).toEqual(['daily_challenge_attempt']);
  });

  it('discloses correctness and score for a submitted attempt', async () => {
    const submitted = {
      ...baseAttempt,
      submitted_option: 'a-1',
      is_correct: true,
      score: 50,
      submitted_at: '2026-08-14T10:00:30.000Z',
    };
    queue('daily_challenge_attempt', { data: submitted, error: null });
    queue('question', { data: questionPlain, error: null });
    queue('question_to_answer', { data: questionToAnswerWithSolution, error: null });

    const body = await (await GET(req('GET'))).json();

    expect(body.correct).toBe(true);
    expect(body.score).toBe(50);
    expect(body.explanation).toBe('Because of X.');
    expect(body.question.options[0]).toHaveProperty('is_correct');
  });
});

describe('POST /api/daily-challenge', () => {
  it('returns 401 without a token', async () => {
    expect((await POST(req('POST', null))).status).toBe(401);
  });

  it('returns 400 when the student has no eligible questions', async () => {
    queueNoCourses();

    const response = await POST(req('POST'));

    expect(response.status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('draws and inserts a new attempt', async () => {
    queue('daily_challenge_attempt', { data: null, error: null }); // findTodayAttempt: none
    queueEligiblePool();
    queue('daily_challenge_attempt', { data: baseAttempt, error: null }); // insert echo
    queue('question', { data: questionWithOptions, error: null }); // buildAttemptResponse's draw

    const response = await POST(req('POST'));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.resumed).toBe(false);
    expect(body.attempt).toEqual(baseAttempt);
    expect(body.question.options).toHaveLength(2);

    const insertPayload = h.state.inserts.find((i) => i.table === 'daily_challenge_attempt')!
      .payload as Record<string, unknown>;
    expect(insertPayload).toMatchObject({ user_id: 'user-123', question_id: 'q-1', challenge_date: expect.any(String) });
  });

  it('returns the existing attempt instead of drawing a second one', async () => {
    queue('daily_challenge_attempt', { data: baseAttempt, error: null });
    queue('question', { data: questionWithOptions, error: null });

    const response = await POST(req('POST'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumed).toBe(true);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns the winning attempt when a parallel request hit the unique index', async () => {
    queue('daily_challenge_attempt', { data: null, error: null }); // findTodayAttempt: none
    queueEligiblePool();
    queue('daily_challenge_attempt', { data: null, error: { code: '23505', message: 'duplicate key' } }); // insert loses the race
    queue('daily_challenge_attempt', { data: baseAttempt, error: null }); // refetch
    queue('question', { data: questionWithOptions, error: null });

    const response = await POST(req('POST'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.resumed).toBe(true);
    expect(body.attempt).toEqual(baseAttempt);
  });
});
