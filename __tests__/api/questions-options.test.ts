import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => result,
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
    from: (table: string) => {
      h.state.tables.push(table);
      const queued = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, queued);
    },
  }),
}));

import { GET } from '../../app/api/questions/[questionId]/options/route';

function makeRequest(questionId: string) {
  return new Request(`http://localhost/api/questions/${questionId}/options`);
}

const PARAMS = (questionId: string) => ({ params: { questionId } });

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
});

describe('GET /api/questions/:questionId/options', () => {
  it('returns 404 when the question does not exist', async () => {
    queue('question', { data: null, error: null });
    const res = await GET(makeRequest('non-existent-id'), PARAMS('non-existent-id'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns options without is_correct or explanation', async () => {
    queue('question', { data: { question_id: 'q-1' }, error: null });
    queue('question_to_answer', {
      data: [
        { answer: { answer_id: 'a-1', option_text: 'Option A' } },
        { answer: { answer_id: 'a-2', option_text: 'Option B' } },
      ],
      error: null,
    });

    const res = await GET(makeRequest('q-1'), PARAMS('q-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toHaveLength(2);
    expect(body.options[0]).toEqual({ answer_id: 'a-1', option_text: 'Option A' });
    expect(body.options[0]).not.toHaveProperty('is_correct');
    expect(body.options[0]).not.toHaveProperty('explanation');
  });

  it('returns an empty options array when the question has no options', async () => {
    queue('question', { data: { question_id: 'q-1' }, error: null });
    queue('question_to_answer', { data: [], error: null });

    const res = await GET(makeRequest('q-1'), PARAMS('q-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toEqual([]);
  });

  it('returns 500 when the question lookup fails', async () => {
    queue('question', { data: null, error: { message: 'DB error' } });
    const res = await GET(makeRequest('q-1'), PARAMS('q-1'));
    expect(res.status).toBe(500);
  });

  it('returns 500 when the options lookup fails', async () => {
    queue('question', { data: { question_id: 'q-1' }, error: null });
    queue('question_to_answer', { data: null, error: { message: 'DB error' } });
    const res = await GET(makeRequest('q-1'), PARAMS('q-1'));
    expect(res.status).toBe(500);
  });
});
