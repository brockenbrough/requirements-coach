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

import { POST } from '../../app/api/sessions/[sessionId]/feedback/route';

const SESSION_ID = 'session-1';

const correctAnswer = {
  answer_id: 'a-1-correct',
  option_text: 'As a user I want to log in.',
  explanation: 'Correct: the role is missing.',
  is_correct: true,
};
const wrongAnswer = {
  answer_id: 'a-1-wrong',
  option_text: 'The system shall persist the token.',
  explanation: 'Incorrect: no technical detail.',
  is_correct: false,
};

const questionOptions = [{ answer: wrongAnswer }, { answer: correctAnswer }];

function logRow(overrides: Record<string, unknown> = {}) {
  return {
    submitted_option: 'a-1-correct',
    score: 25,
    submitted_at: '2026-07-29T10:05:00.000Z',
    ...overrides,
  };
}

function req(body?: object, token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/sessions/${SESSION_ID}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const ctx = { params: { sessionId: SESSION_ID } };

/** Queues one full feedback lookup: session, answered log, question options. */
function queueLookup({
  log = logRow() as Record<string, unknown> | null,
  options = questionOptions as unknown[],
} = {}) {
  queue('session_log', { data: { session_id: SESSION_ID }, error: null });
  queue('answered_question_log', { data: log, error: null });
  queue('question_to_answer', { data: options, error: null });
}

describe('POST /api/sessions/{sessionId}/feedback', () => {
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
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await POST(
      new Request(`http://localhost/api/sessions/${SESSION_ID}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer valid-token' },
        body: '{ not json',
      }),
      ctx,
    );
    expect(response.status).toBe(400);
  });

  // A session belonging to somebody else looks exactly like one that does not exist.
  it("returns 404 for a session that is not the requesting student's", async () => {
    queue('session_log', { data: null, error: null });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);

    expect(response.status).toBe(404);
    expect(h.state.tables).not.toContain('answered_question_log');
  });

  it('returns 404 when the question was not answered in this session', async () => {
    queueLookup({ log: null });

    const response = await POST(req({ questionId: 'q-9', selectedOptionId: 'a-1-correct' }), ctx);

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/answered question log/i);
  });

  // Without the submitted_option filter this endpoint would grade any option on demand.
  it('returns 404 for an option the student did not submit', async () => {
    queueLookup({ log: null });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-wrong' }), ctx);

    expect(response.status).toBe(404);
    expect(h.state.tables).not.toContain('question_to_answer');
  });

  it('returns 404 when the question has no options', async () => {
    queueLookup({ options: [] });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/question not found/i);
  });

  it('returns only the selected explanation for a correct answer', async () => {
    queueLookup();

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.correct).toBe(true);
    expect(body.questionId).toBe('q-1');
    expect(body.score).toBe(25);
    expect(body.submittedAt).toBe('2026-07-29T10:05:00.000Z');
    expect(body.selectedOption).toEqual({
      answerId: 'a-1-correct',
      optionText: 'As a user I want to log in.',
      explanation: 'Correct: the role is missing.',
    });
    // Nothing to add: the pick already is the correct option.
    expect(body.correctOption).toBeNull();
  });

  it('returns the correct option and its explanation for a wrong answer', async () => {
    queueLookup({ log: logRow({ submitted_option: 'a-1-wrong', score: 0 }) });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-wrong' }), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.correct).toBe(false);
    expect(body.score).toBe(0);
    expect(body.selectedOption).toEqual({
      answerId: 'a-1-wrong',
      optionText: 'The system shall persist the token.',
      explanation: 'Incorrect: no technical detail.',
    });
    expect(body.correctOption).toEqual({
      answerId: 'a-1-correct',
      optionText: 'As a user I want to log in.',
      explanation: 'Correct: the role is missing.',
    });
  });

  // The other options stay hidden — feedback is about the pick and the solution, nothing else.
  it('does not disclose the remaining options', async () => {
    queueLookup({
      log: logRow({ submitted_option: 'a-1-wrong', score: 0 }),
      options: [
        { answer: wrongAnswer },
        { answer: correctAnswer },
        { answer: { answer_id: 'a-1-other', option_text: 'Other', explanation: 'Other why', is_correct: false } },
      ],
    });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-wrong' }), ctx);
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain('a-1-other');
  });

  it('returns 500 when the question bank has no correct option', async () => {
    queueLookup({
      log: logRow({ submitted_option: 'a-1-wrong', score: 0 }),
      options: [{ answer: wrongAnswer }],
    });

    const response = await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-wrong' }), ctx);

    expect(response.status).toBe(500);
  });

  it('never writes', async () => {
    queueLookup();

    await POST(req({ questionId: 'q-1', selectedOptionId: 'a-1-correct' }), ctx);

    expect(h.state.inserts).toHaveLength(0);
    expect(h.state.updates).toHaveLength(0);
  });
});
