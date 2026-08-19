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
      is: () => builder,
      order: () => builder,
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

import { GET } from '../../app/api/sessions/current/route';

const ACTIVITY = 'IDENTIFY_WEAK_USER_STORIES';

const sessionRow = {
  session_id: 'session-1',
  user_id: 'user-123',
  activity_type: ACTIVITY,
  difficulty_level: 1,
  started_at: '2026-07-29T10:00:00.000Z',
  ended_at: null,
  status: 'in-progress',
  cumulative_score: 50,
  max_score: 100,
  passed: false,
};

const drawnQuestions = Array.from({ length: 4 }, (_, i) => ({
  position: i,
  question: {
    question_id: `q-${i + 1}`,
    question_prompt: `Prompt ${i + 1}`,
    difficulty_level: 1,
    activity_type: ACTIVITY,
    max_score: 25,
    question_to_answer: [
      { answer: { answer_id: `a-${i + 1}-1`, option_text: 'Option 1' } },
      { answer: { answer_id: `a-${i + 1}-2`, option_text: 'Option 2' } },
    ],
  },
}));

/** Two answers already submitted: q-1 correct, q-2 wrong. */
const submittedAnswers = [
  {
    question_id: 'q-1',
    submitted_option: 'a-1-1',
    score: 25,
    submitted_at: '2026-07-29T10:05:00.000Z',
    answer: { is_correct: true, explanation: 'Correct: the role is missing.' },
  },
  {
    question_id: 'q-2',
    submitted_option: 'a-2-2',
    score: 0,
    submitted_at: '2026-07-29T10:07:00.000Z',
    answer: { is_correct: false, explanation: 'Incorrect: no technical detail.' },
  },
];

/** Queues a successful activity_type lookup (GitHub #347: isActivityType is now a DB read). */
function queueValidActivityType(activityType = ACTIVITY) {
  queue('activity_type', { data: { activity_type: activityType }, error: null });
}

function req(activityType: string | null = ACTIVITY, token: string | null = 'valid-token') {
  const url = activityType
    ? `http://localhost/api/sessions/current?activityType=${activityType}`
    : 'http://localhost/api/sessions/current';

  return new Request(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('GET /api/sessions/current', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
  });

  it('returns 401 without a token', async () => {
    expect((await GET(req(ACTIVITY, null))).status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    queueValidActivityType();
    expect((await GET(req(ACTIVITY, 'bad-token'))).status).toBe(401);
  });

  it('returns 400 when activityType is missing or unknown', async () => {
    expect((await GET(req(null))).status).toBe(400);
    expect((await GET(req('NOT_A_REAL_ACTIVITY'))).status).toBe(400);
  });

  // Nothing in progress is a normal state, not an error: the client shows "start" instead.
  it('returns 200 with a null session when nothing is in progress', async () => {
    queueValidActivityType();
    queue('session_log', { data: null, error: null });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session).toBeNull();
    expect(body.questions).toEqual([]);
    expect(body.answers).toEqual([]);
    expect(body.nextPosition).toBeNull();
  });

  it('resumes at the first unanswered question', async () => {
    queueValidActivityType();
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });
    queue('answered_question_log', { data: submittedAnswers, error: null });

    const response = await GET(req());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session).toEqual(sessionRow);
    expect(body.questions).toHaveLength(4);
    expect(body.questions.map((q: { position: number }) => q.position)).toEqual([0, 1, 2, 3]);

    // q-1 and q-2 are answered, so position 2 is where the student continues.
    expect(body.answeredCount).toBe(2);
    expect(body.nextPosition).toBe(2);
    expect(body.completed).toBe(false);
  });

  // The unanswered questions must not carry their solution.
  it('never exposes is_correct on the questions', async () => {
    queueValidActivityType();
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });
    queue('answered_question_log', { data: submittedAnswers, error: null });

    const body = await (await GET(req())).json();

    expect(JSON.stringify(body.questions)).not.toContain('is_correct');
    // Order isn't asserted here — GitHub #129 has loadSessionQuestions shuffle options, so only
    // the set (and the shape: no is_correct/explanation) is guaranteed, not a fixed position.
    expect(body.questions[0].options).toHaveLength(2);
    expect(body.questions[0].options).toEqual(
      expect.arrayContaining([
        { answer_id: 'a-1-1', option_text: 'Option 1' },
        { answer_id: 'a-1-2', option_text: 'Option 2' },
      ]),
    );
  });

  // Feedback for questions the student has already committed to is theirs to see.
  it('returns correctness and explanation for answers already submitted', async () => {
    queueValidActivityType();
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });
    queue('answered_question_log', { data: submittedAnswers, error: null });

    const body = await (await GET(req())).json();

    expect(body.answers).toHaveLength(2);
    expect(body.answers[0]).toEqual({
      question_id: 'q-1',
      submitted_option: 'a-1-1',
      score: 25,
      submitted_at: '2026-07-29T10:05:00.000Z',
      correct: true,
      explanation: 'Correct: the role is missing.',
    });
    expect(body.answers[1].correct).toBe(false);
  });

  it('reports a fresh session with no answers yet', async () => {
    queueValidActivityType();
    queue('session_log', { data: { ...sessionRow, cumulative_score: 0 }, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });
    queue('answered_question_log', { data: [], error: null });

    const body = await (await GET(req())).json();

    expect(body.answers).toEqual([]);
    expect(body.answeredCount).toBe(0);
    expect(body.nextPosition).toBe(0);
    expect(body.completed).toBe(false);
  });

  it('reports completed when every question has been answered', async () => {
    queueValidActivityType();
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });
    queue('answered_question_log', {
      data: drawnQuestions.map((row, i) => ({
        question_id: row.question.question_id,
        submitted_option: `a-${i + 1}-1`,
        score: 25,
        submitted_at: '2026-07-29T10:10:00.000Z',
        answer: { is_correct: true, explanation: 'Correct.' },
      })),
      error: null,
    });

    const body = await (await GET(req())).json();

    expect(body.answeredCount).toBe(4);
    expect(body.nextPosition).toBeNull();
    expect(body.completed).toBe(true);
  });

  // Answers may arrive in any order; the next position must not depend on it.
  it('derives the next position independently of row order', async () => {
    queueValidActivityType();
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_question', { data: [...drawnQuestions].reverse(), error: null });
    queue('answered_question_log', { data: [...submittedAnswers].reverse(), error: null });

    const body = await (await GET(req())).json();

    expect(body.nextPosition).toBe(2);
  });

  // GitHub #583: an assembledQuizId query param must be accepted and forwarded without erroring
  // — the underlying filter itself is verified at the source in __tests__/lib/sessionQueries.test.ts,
  // since this harness's .eq() is a no-op and can't record it.
  it('accepts an assembledQuizId query param and resumes normally', async () => {
    queueValidActivityType();
    queue('session_log', { data: sessionRow, error: null });
    queue('session_to_question', { data: drawnQuestions, error: null });
    queue('answered_question_log', { data: submittedAnswers, error: null });

    const url = `http://localhost/api/sessions/current?activityType=${ACTIVITY}&assembledQuizId=quiz-1`;
    const response = await GET(new Request(url, { headers: { authorization: 'Bearer valid-token' } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session).toEqual(sessionRow);
  });
});
