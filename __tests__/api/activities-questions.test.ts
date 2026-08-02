import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ column, value });
        return builder;
      },
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
      const queued = h.state.queues[table]?.shift() ?? { data: [], error: null };
      return h.makeBuilder(table, queued);
    },
  }),
}));

import { GET } from '../../app/api/activities/[activityType]/questions/route';

function makeRequest(activityType: string, difficulty?: string) {
  const url = `http://localhost/api/activities/${activityType}/questions${difficulty ? `?difficulty=${difficulty}` : ''}`;
  return new Request(url);
}

const PARAMS = (activityType: string) => ({ params: { activityType } });

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/activities/:activityType/questions', () => {
  it('returns 400 for an unknown activity type', async () => {
    const res = await GET(makeRequest('UNKNOWN_ACTIVITY', '1'), PARAMS('UNKNOWN_ACTIVITY'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unknown activity type/i);
  });

  it('returns 400 when difficulty is missing', async () => {
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/difficulty/i);
  });

  it('returns 400 when difficulty is not 1, 2, or 3', async () => {
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '5'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/difficulty/i);
  });

  it('returns an empty array when no questions exist for the combination', async () => {
    queue('question', { data: [], error: null });
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toEqual([]);
  });

  it('returns matching questions with the correct fields', async () => {
    const mockQuestions = [
      { question_id: 'q-1', question_prompt: 'Which story is weakest?', difficulty_level: 1, max_score: 25 },
      { question_id: 'q-2', question_prompt: 'Pick the worst story.', difficulty_level: 1, max_score: 25 },
    ];
    queue('question', { data: mockQuestions, error: null });

    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(2);
    expect(body.questions[0]).toMatchObject({
      question_id: 'q-1',
      question_prompt: 'Which story is weakest?',
      difficulty_level: 1,
      max_score: 25,
    });
  });

  it('filters by activity type and difficulty level', async () => {
    queue('question', { data: [], error: null });
    await GET(makeRequest('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', '2'), PARAMS('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'));
    expect(h.state.filters).toContainEqual({ column: 'activity_type', value: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA' });
    expect(h.state.filters).toContainEqual({ column: 'difficulty_level', value: 2 });
  });

  it('returns 500 when the database returns an error', async () => {
    queue('question', { data: null, error: { message: 'DB error' } });
    const res = await GET(makeRequest('IDENTIFY_WEAK_USER_STORIES', '1'), PARAMS('IDENTIFY_WEAK_USER_STORIES'));
    expect(res.status).toBe(500);
  });
});
