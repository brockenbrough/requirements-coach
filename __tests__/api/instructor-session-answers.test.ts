import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
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
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/instructor/sessions/[sessionId]/answers/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function questionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    position: 1,
    question: {
      question_id: 'question-1',
      question_prompt: 'Which story is weakest?',
      question_to_answer: [
        { answer: { answer_id: 'answer-1', option_text: 'Option A', is_correct: true, explanation: 'Correct because...' } },
        { answer: { answer_id: 'answer-2', option_text: 'Option B', is_correct: false, explanation: 'Wrong because...' } },
      ],
    },
    ...overrides,
  };
}

function request(token?: string) {
  return new Request('http://localhost/api/instructor/sessions/session-1/answers', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function callRoute(token?: string, sessionId = 'session-1') {
  return GET(request(token), { params: { sessionId } });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/instructor/sessions/:sessionId/answers', () => {
  it('answers 401 without a token', async () => {
    const response = await callRoute();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(h.state.tables).toEqual([]);
  });

  it('rejects a student with 403 and an empty body, before reading any session', async () => {
    queueRole('student');

    const response = await callRoute('valid-token');

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(h.state.tables).not.toContain('session_to_question');
  });

  it('returns 404 when the session does not exist', async () => {
    queueRole('instructor');
    queue('session_log', { data: null, error: null });

    const response = await callRoute('valid-token');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Session not found.');
    expect(h.state.tables).not.toContain('session_to_question');
  });

  it('returns every question with options, correctness, and the selected answer', async () => {
    queueRole('instructor');
    queue('session_log', { data: { session_id: 'session-1' }, error: null });
    queue('session_to_question', { data: [questionRow()], error: null });
    queue('answered_question_log', { data: [{ question_id: 'question-1', submitted_option: 'answer-2' }], error: null });

    const response = await callRoute('valid-token');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toEqual([
      {
        position: 1,
        questionId: 'question-1',
        prompt: 'Which story is weakest?',
        options: [
          { answer_id: 'answer-1', option_text: 'Option A', is_correct: true, explanation: 'Correct because...' },
          { answer_id: 'answer-2', option_text: 'Option B', is_correct: false, explanation: 'Wrong because...' },
        ],
        selectedAnswerId: 'answer-2',
      },
    ]);
  });

  it('sets selectedAnswerId to null for a question with no logged answer', async () => {
    queueRole('instructor');
    queue('session_log', { data: { session_id: 'session-1' }, error: null });
    queue('session_to_question', { data: [questionRow()], error: null });
    queue('answered_question_log', { data: [], error: null });

    const response = await callRoute('valid-token');
    const body = await response.json();

    expect(body.questions[0].selectedAnswerId).toBeNull();
  });

  it('scopes both the question and answer queries to the requested session', async () => {
    queueRole('instructor');
    queue('session_log', { data: { session_id: 'session-9' }, error: null });
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });

    await callRoute('valid-token', 'session-9');

    expect(h.state.filters).toContainEqual({ table: 'session_to_question', column: 'session_id', value: 'session-9' });
    expect(h.state.filters).toContainEqual({ table: 'answered_question_log', column: 'session_id', value: 'session-9' });
  });

  it('returns 500 when the question query fails', async () => {
    queueRole('instructor');
    queue('session_log', { data: { session_id: 'session-1' }, error: null });
    queue('session_to_question', { data: null, error: { message: 'boom' } });
    queue('answered_question_log', { data: [], error: null });

    const response = await callRoute('valid-token');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
  });
});
