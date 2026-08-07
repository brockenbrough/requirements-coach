import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Hoisted so the vi.mock factories below can close over it safely.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    updates: [] as { table: string; payload: unknown }[],
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
      limit: () => builder,
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

vi.mock('../../lib/llm/factory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/llm/factory')>();
  return { ...actual, getLLMProvider: vi.fn() };
});

import { getLLMProvider } from '../../lib/llm/factory';
import { POST } from '../../app/api/activities/write-acceptance-criteria/submissions/route';

const STORY = {
  user_story_id: 'story-1',
  story_text: 'As a user, I want to log in with email.',
  creator_id: 'instructor-1',
};
const CONFIG = { provider: 'CLAUDE', api_key: 'sk-test', model: 'claude-opus-5' };

function req(body?: object, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/activities/write-acceptance-criteria/submissions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Queues story lookup + the story creator's config lookup, the two reads before any write. */
function queueLookups({ story = STORY as Result['data'], config = CONFIG as Result['data'] } = {}) {
  queue('user_story', { data: story, error: null });
  queue('instructor_llm_config', { data: config, error: null });
}

function mockProvider(rating: { score: number; feedback: string } | Error) {
  const rateAcceptanceCriteria = vi.fn().mockImplementation(async () => {
    if (rating instanceof Error) throw rating;
    return rating;
  });
  vi.mocked(getLLMProvider).mockReturnValue({ rateAcceptanceCriteria });
  return rateAcceptanceCriteria;
}

describe('POST /api/activities/write-acceptance-criteria/submissions', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.inserts = [];
    h.state.updates = [];
    h.state.tables = [];
    h.state.filters = [];
    vi.mocked(getLLMProvider).mockReset();
  });

  it('returns 401 without a token', async () => {
    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }, null));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await POST(
      req({ userStoryId: 'story-1', submittedText: 'Given...' }, 'bad-token'),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 for a malformed JSON body', async () => {
    const response = await POST(
      new Request('http://localhost/api/activities/write-acceptance-criteria/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer valid-token' },
        body: '{ not json',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 when userStoryId is missing or blank', async () => {
    expect((await POST(req({ submittedText: 'Given...' }))).status).toBe(400);
    expect((await POST(req({ userStoryId: '  ', submittedText: 'Given...' }))).status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
  });

  // Rejected before any LLM call — no provider should even be looked up.
  it('returns 400 when submittedText is missing or blank', async () => {
    expect((await POST(req({ userStoryId: 'story-1' }))).status).toBe(400);
    expect((await POST(req({ userStoryId: 'story-1', submittedText: '   ' }))).status).toBe(400);
    expect(h.state.inserts).toHaveLength(0);
    expect(getLLMProvider).not.toHaveBeenCalled();
  });

  it('returns 404 when the user story does not exist', async () => {
    queueLookups({ story: null });

    const response = await POST(req({ userStoryId: 'missing-story', submittedText: 'Given...' }));

    expect(response.status).toBe(404);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns 500 when the user story lookup errors', async () => {
    queue('user_story', { data: null, error: { message: 'db down' } });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));

    expect(response.status).toBe(500);
  });

  it('returns 500 when the story creator has no LLM provider configured', async () => {
    queueLookups({ config: null });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/has not configured an llm provider/i);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('looks up instructor_llm_config filtered by the story creator, not a global flag', async () => {
    queueLookups();
    mockProvider({ score: 8, feedback: 'ok' });

    await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));

    expect(h.state.filters).toContainEqual({
      table: 'instructor_llm_config',
      column: 'user_id',
      value: STORY.creator_id,
    });
    expect(h.state.filters).not.toContainEqual(
      expect.objectContaining({ table: 'instructor_llm_config', column: 'is_active' }),
    );
  });

  it('passes the config row\'s provider, api_key, and model to getLLMProvider', async () => {
    queueLookups();
    mockProvider({ score: 8, feedback: 'ok' });

    await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));

    expect(getLLMProvider).toHaveBeenCalledWith(CONFIG.provider, CONFIG.api_key, CONFIG.model);
  });

  it('returns 500 when the config lookup errors', async () => {
    queue('user_story', { data: STORY, error: null });
    queue('instructor_llm_config', { data: null, error: { message: 'db down' } });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));

    expect(response.status).toBe(500);
  });

  it('returns 500 when the configured provider name is invalid', async () => {
    queueLookups({ config: { provider: 'NOT_A_PROVIDER', api_key: 'sk-test', model: 'x' } });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));

    expect(response.status).toBe(500);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('returns 500 when the provider factory returns null (missing api key)', async () => {
    queueLookups({ config: { provider: 'CLAUDE', api_key: '', model: 'claude-opus-5' } });
    vi.mocked(getLLMProvider).mockReturnValue(null);

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));

    expect(response.status).toBe(500);
    expect(h.state.inserts).toHaveLength(0);
  });

  it('inserts the submission with null grading columns before calling the LLM', async () => {
    queueLookups();
    let insertsAtCallTime = -1;
    const rateAcceptanceCriteria = vi.fn().mockImplementation(async () => {
      insertsAtCallTime = h.state.inserts.length;
      return { score: 8, feedback: 'Solid, could be more testable.' };
    });
    vi.mocked(getLLMProvider).mockReturnValue({ rateAcceptanceCriteria });

    await POST(req({ userStoryId: 'story-1', submittedText: 'Given a user, when they log in...' }));

    expect(insertsAtCallTime).toBe(1);
    const submissionInsert = h.state.inserts.find((i) => i.table === 'submission')!
      .payload as Record<string, unknown>;
    expect(submissionInsert).toMatchObject({
      user_id: 'user-123',
      user_story_id: 'story-1',
      submitted_text: 'Given a user, when they log in...',
    });
    expect(submissionInsert.submission_id).toEqual(expect.any(String));
    expect(submissionInsert).not.toHaveProperty('llm_score');
    expect(submissionInsert).not.toHaveProperty('llm_feedback');

    expect(rateAcceptanceCriteria).toHaveBeenCalledWith(
      STORY.story_text,
      'Given a user, when they log in...',
    );
  });

  it('returns 500 when the submission insert fails', async () => {
    queue('user_story', { data: STORY, error: null });
    queue('instructor_llm_config', { data: CONFIG, error: null });
    queue('submission', { data: null, error: { message: 'insert failed' } });
    mockProvider({ score: 8, feedback: 'ok' });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));

    expect(response.status).toBe(500);
  });

  it('returns 502 when the provider call throws', async () => {
    queueLookups();
    mockProvider(new Error('upstream timeout'));

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/upstream timeout/);
  });

  it('updates the submission with the graded result and returns 200', async () => {
    queueLookups();
    mockProvider({ score: 9, feedback: 'Clear and testable.' });

    const response = await POST(
      req({ userStoryId: 'story-1', submittedText: 'Given a user, when they log in...' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      submissionId: expect.any(String),
      score: 9,
      feedback: 'Clear and testable.',
    });

    const update = h.state.updates.find((u) => u.table === 'submission')!
      .payload as Record<string, unknown>;
    expect(update).toMatchObject({
      llm_score: 9,
      llm_feedback: 'Clear and testable.',
      llm_provider: 'CLAUDE',
    });
    expect(update.graded_at).toEqual(expect.any(String));
  });

  it('returns 500 when the post-grading update fails', async () => {
    queue('user_story', { data: STORY, error: null });
    queue('instructor_llm_config', { data: CONFIG, error: null });
    queue('submission', { data: null, error: null });
    queue('submission', { data: null, error: { message: 'update failed' } });
    mockProvider({ score: 8, feedback: 'ok' });

    const response = await POST(req({ userStoryId: 'story-1', submittedText: 'Given...' }));

    expect(response.status).toBe(500);
  });
});
