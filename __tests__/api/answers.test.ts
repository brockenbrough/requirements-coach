import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factory below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    updates: [] as { table: string; payload: unknown }[],
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
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

import { POST } from '../../app/api/sessions/[sessionId]/answers/route';

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
    cumulative_score: 0,
    max_score: 100,
    passed: false,
    badge_id: null,
    ...overrides,
  };
}

const sessionQuestions = Array.from({ length: 4 }, (_, i) => ({
  position: i,
  question_id: `q-${i + 1}`,
}));

const correctOption = {
  answer: { answer_id: 'a-1-correct', is_correct: true, explanation: 'Correct: the role is missing.' },
};
const wrongOption = {
  answer: { answer_id: 'a-1-wrong', is_correct: false, explanation: 'Incorrect: no technical detail.' },
};

/** The answered_question_log row the insert echoes back, as the database would return it. */
function answerLogRow(overrides: Record<string, unknown> = {}) {
  return {
    log_id: 'log-1',
    session_id: SESSION_ID,
    question_id: 'q-1',
    answer_id: 'a-1-correct',
    score: 25,
    submitted_at: '2026-07-29T10:05:00.000Z',
    ...overrides,
  };
}

function req(body?: object, token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/sessions/${SESSION_ID}/answers`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const ctx = { params: { sessionId: SESSION_ID } };

/**
 * Queues one full submission.
 * `alreadyAnswered` are the question ids logged before this call, so the answered set
 * afterwards is those plus the submitted one.
 */
function queueSubmission({
  option = correctOption,
  alreadyAnswered = [] as string[],
  submitted = 'q-1',
  insertResult = null as Result | null,
  cumulativeAfter = 25,
  maxScore = 25 as number | null,
} = {}) {
  // The insert echoes back the row it wrote, so by default it mirrors what was submitted.
  const echoed: Result = insertResult ?? {
    data: answerLogRow({ question_id: submitted, answer_id: option.answer.answer_id }),
    error: null,
  };

  queue('session_log', { data: sessionRow(), error: null });                    // ownership + status
  queue('session_to_question', { data: sessionQuestions, error: null });        // the 4 drawn questions
  queue('question_to_answer', { data: option, error: null });                   // option belongs to question
  queue('question', { data: { max_score: maxScore }, error: null });            // points available
  queue('answered_question_log', echoed);                                       // the insert
  // loadProgress
  queue('session_log', { data: sessionRow({ cumulative_score: cumulativeAfter }), error: null });
  queue('answered_question_log', {
    data: [...alreadyAnswered, submitted].map((question_id) => ({ question_id })),
    error: null,
  });
}

describe('POST /api/sessions/{sessionId}/answers', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.inserts = [];
    h.state.updates = [];
    h.state.tables = [];
  });

  it('returns 401 without a token', async () => {
    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }, null), ctx);
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await POST(
      req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }, 'bad-token'),
      ctx,
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 when questionId or selectedOptionId is missing', async () => {
    expect((await POST(req({ questionId: 'q-1' }), ctx)).status).toBe(400);
    expect((await POST(req({ selectedOptionId: 'a-1-correct' }), ctx)).status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await POST(
      new Request(`http://localhost/api/sessions/${SESSION_ID}/answers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer valid-token' },
        body: '{ not json',
      }),
      ctx,
    );
    expect(response.status).toBe(400);
  });

  // A session belonging to somebody else looks exactly like one that does not exist.
  it('returns 404 for a session that is not the requesting student\'s', async () => {
    queue('session_log', { data: null, error: null });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);

    expect(response.status).toBe(404);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns 409 when the session is no longer in progress', async () => {
    queue('session_log', { data: sessionRow({ status: 'completed' }), error: null });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);

    expect(response.status).toBe(409);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns 400 when the question is not part of this session', async () => {
    queue('session_log', { data: sessionRow(), error: null });
    queue('session_to_question', { data: sessionQuestions, error: null });

    const response = await POST(
      req({ questionId: 'q-99-from-the-bank', selectedOptionId: 'a-1-correct' }),
      ctx,
    );

    expect(response.status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
  });

  // Answer ids are visible to the client, so a correct option from another question must not score.
  it('returns 400 when the option belongs to a different question', async () => {
    queue('session_log', { data: sessionRow(), error: null });
    queue('session_to_question', { data: sessionQuestions, error: null });
    queue('question_to_answer', { data: null, error: null });

    const response = await POST(
      req({ questionId: 'q-1', selectedOptionId: 'a-4-correct' }),
      ctx,
    );

    expect(response.status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('records a correct answer, scores it and reveals the explanation', async () => {
    queueSubmission({ alreadyAnswered: [] });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.correct).toBe(true);
    expect(body.explanation).toBe('Correct: the role is missing.');
    expect(body.score).toBe(25);
    expect(body.answeredCount).toBe(1);
    expect(body.nextPosition).toBe(1);
    expect(body.completed).toBe(false);

    const log = h.state.inserts.find((i) => i.table === 'answered_question_log')!
      .payload as Record<string, unknown>;

    expect(log).toMatchObject({
      session_id: SESSION_ID,
      user_id: 'user-123',
      question_id: 'q-1',
      answer_id: 'a-1-correct',
      score: 25,
    });
    expect(log.log_id).toEqual(expect.any(String));
  });

  // REQ-DL-4.1: the caller gets back the record that was created, not just the outcome.
  it('returns the created answer log record', async () => {
    queueSubmission({
      insertResult: { data: answerLogRow({ log_id: 'log-42' }), error: null },
    });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.answer).toEqual({
      logId: 'log-42',
      sessionId: SESSION_ID,
      questionId: 'q-1',
      selectedOptionId: 'a-1-correct',
      score: 25,
      submittedAt: '2026-07-29T10:05:00.000Z',
    });
  });

  // The write is committed even if the row does not come back, so the submission must not fail:
  // only the timestamp, which exists solely in the database, is reported as unknown.
  it('still returns the record when the insert does not echo the row back', async () => {
    queueSubmission({ insertResult: { data: null, error: null } });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.answer.submittedAt).toBeNull();
    expect(body.answer.questionId).toBe('q-1');
    expect(body.answer.selectedOptionId).toBe('a-1-correct');
    expect(body.answer.logId).toEqual(expect.any(String));
  });

  it('records a wrong answer with score 0', async () => {
    queueSubmission({ option: wrongOption, cumulativeAfter: 0 });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-wrong' }), ctx);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.correct).toBe(false);
    expect(body.score).toBe(0);

    const log = h.state.inserts.find((i) => i.table === 'answered_question_log')!
      .payload as Record<string, unknown>;
    expect(log.score).toBe(0);
  });

  it('takes the score from the answer bank, not from the request body', async () => {
    queueSubmission({ option: wrongOption, cumulativeAfter: 0 });

    await POST(
      req({ questionId: 'q-1', selectedOptionId: 'a-1-wrong', score: 25, correct: true }),
      ctx,
    );

    const log = h.state.inserts.find((i) => i.table === 'answered_question_log')!
      .payload as Record<string, unknown>;
    expect(log.score).toBe(0);
  });

  // Falls back to 25 when question.max_score is null (the column is nullable).
  it('falls back to the default question score when max_score is null', async () => {
    queueSubmission({ maxScore: null });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);

    expect((await response.json()).score).toBe(25);
  });

  // uq_answered_question_log_session_question — first write wins.
  it('returns 409 and does not score twice when the question was already answered', async () => {
    queue('session_log', { data: sessionRow({ cumulative_score: 25 }), error: null });
    queue('session_to_question', { data: sessionQuestions, error: null });
    queue('question_to_answer', { data: correctOption, error: null });
    queue('question', { data: { max_score: 25 }, error: null });
    queue('answered_question_log', {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    // loadProgress for the conflict response
    queue('session_log', { data: sessionRow({ cumulative_score: 25 }), error: null });
    queue('answered_question_log', { data: [{ question_id: 'q-1' }], error: null });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already been answered/i);
    expect(body.session.cumulative_score).toBe(25);
    expect(body.nextPosition).toBe(1);
    // The conflict must not leak the outcome of an answer that was not recorded, and there is
    // no new log record to hand back — the first write is the one that stands.
    expect(body).not.toHaveProperty('correct');
    expect(body).not.toHaveProperty('answer');
    expect(h.state.updates).toHaveLength(0);
  });

  it('completes the session and sets passed on the fourth answer', async () => {
    queueSubmission({ alreadyAnswered: ['q-1', 'q-2', 'q-3'], submitted: 'q-4', cumulativeAfter: 100 });
    queue('session_log', {
      data: sessionRow({ status: 'completed', cumulative_score: 100, passed: true, ended_at: '2026-07-29T10:30:00.000Z' }),
      error: null,
    });

    const response = await POST(req({ questionId: 'q-4', selectedOptionId: 'a-1-correct' }), ctx);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.completed).toBe(true);
    expect(body.nextPosition).toBeNull();
    expect(body.answeredCount).toBe(4);
    expect(body.session.status).toBe('completed');
    expect(body.session.passed).toBe(true);

    const update = h.state.updates.find((u) => u.table === 'session_log')!
      .payload as Record<string, unknown>;
    expect(update).toMatchObject({ status: 'completed', passed: true });
    expect(update.ended_at).toEqual(expect.any(String));
  });

  // 75 of 100 is below the 80% threshold from the requirements.
  it('completes without passing when the score stays under 80 percent', async () => {
    queueSubmission({ alreadyAnswered: ['q-1', 'q-2', 'q-3'], submitted: 'q-4', cumulativeAfter: 75 });
    queue('session_log', {
      data: sessionRow({ status: 'completed', cumulative_score: 75, passed: false }),
      error: null,
    });

    const response = await POST(req({ questionId: 'q-4', selectedOptionId: 'a-1-correct' }), ctx);
    const body = await response.json();

    expect(body.completed).toBe(true);
    expect(body.session.passed).toBe(false);

    const update = h.state.updates.find((u) => u.table === 'session_log')!
      .payload as Record<string, unknown>;
    expect(update.passed).toBe(false);
  });

  it('does not complete the session while questions are left', async () => {
    queueSubmission({ alreadyAnswered: ['q-1'], submitted: 'q-2', cumulativeAfter: 50 });

    const response = await POST(req({ questionId: 'q-2', selectedOptionId: 'a-1-correct' }), ctx);
    const body = await response.json();

    expect(body.completed).toBe(false);
    expect(body.nextPosition).toBe(2);
    expect(h.state.updates).toHaveLength(0);
  });
});
