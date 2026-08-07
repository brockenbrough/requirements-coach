import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
    updates: [] as { table: string; payload: unknown }[],
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
      // PostgrestFilterBuilder is thenable — queries without .single() are awaited directly
      // (the deactivate UPDATE never calls .single()).
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

/** The guard's own lookup: requireInstructor reads the caller's role from "user" first. */
function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
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

import { GET, POST } from '../../app/api/instructor/llm-config/route';

function req(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/llm-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function getReq(token: string | null = 'valid-token', query = '') {
  return new Request(`http://localhost/api/instructor/llm-config${query}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function configRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    instructor_llm_config_id: 'config-1',
    provider: 'CLAUDE',
    model: 'claude-opus-5',
    is_active: false,
    updated_at: '2026-08-06T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
  h.state.updates = [];
  h.state.filters = [];
});

describe('POST /api/instructor/llm-config', () => {
  it('saves a config and never echoes the api key back', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: configRow(), error: null });

    const res = await POST(req({ provider: 'CLAUDE', apiKey: 'sk-secret', model: 'claude-opus-5' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config).toEqual(configRow());
    expect(JSON.stringify(body)).not.toContain('sk-secret');

    expect(h.state.inserts).toHaveLength(1);
    expect(h.state.inserts[0].payload).toMatchObject({
      user_id: 'instructor-1',
      provider: 'CLAUDE',
      model: 'claude-opus-5',
      api_key: 'sk-secret',
      is_active: false,
    });
  });

  it('deactivates any previously active row when setActive is true', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: [], error: null }); // the deactivate UPDATE
    queue('instructor_llm_config', { data: configRow({ is_active: true }), error: null }); // the INSERT

    const res = await POST(req({ provider: 'GEMINI', apiKey: 'sk-secret', model: 'gemini-2.0-flash', setActive: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config.is_active).toBe(true);

    expect(h.state.updates).toHaveLength(1);
    expect(h.state.updates[0]).toEqual({ table: 'instructor_llm_config', payload: { is_active: false } });
    expect(h.state.filters).toContainEqual({ table: 'instructor_llm_config', column: 'is_active', value: true });
  });

  it('does not deactivate anything when setActive is false or omitted', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: configRow(), error: null });

    await POST(req({ provider: 'CLAUDE', apiKey: 'sk-secret', model: 'claude-opus-5' }));

    expect(h.state.updates).toHaveLength(0);
  });

  it('retries the deactivate+insert pair once on a unique-index race', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: [], error: null }); // first deactivate
    queue('instructor_llm_config', { data: null, error: { code: '23505', message: 'duplicate' } }); // racing insert
    queue('instructor_llm_config', { data: [], error: null }); // retry deactivate
    queue('instructor_llm_config', { data: configRow({ is_active: true }), error: null }); // retry insert

    const res = await POST(req({ provider: 'CLAUDE', apiKey: 'sk-secret', model: 'claude-opus-5', setActive: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config.is_active).toBe(true);
    expect(h.state.updates).toHaveLength(2);
  });

  it('rejects an unknown provider with 400', async () => {
    queueRole('instructor');
    const res = await POST(req({ provider: 'LLAMA', apiKey: 'sk-secret', model: 'llama-4' }));

    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('instructor_llm_config');
  });

  it('rejects a missing provider with 400', async () => {
    queueRole('instructor');
    const res = await POST(req({ apiKey: 'sk-secret', model: 'claude-opus-5' }));

    expect(res.status).toBe(400);
  });

  it('rejects an empty api key with 400', async () => {
    queueRole('instructor');
    const res = await POST(req({ provider: 'CLAUDE', apiKey: '  ', model: 'claude-opus-5' }));

    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('instructor_llm_config');
  });

  it('rejects a missing api key with 400', async () => {
    queueRole('instructor');
    const res = await POST(req({ provider: 'CLAUDE', model: 'claude-opus-5' }));

    expect(res.status).toBe(400);
  });

  it('answers 401 without a token', async () => {
    const res = await POST(req({ provider: 'CLAUDE', apiKey: 'sk-secret', model: 'claude-opus-5' }, null));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(h.state.tables).toEqual([]);
  });

  it('answers 401 for an invalid token', async () => {
    const res = await POST(req({ provider: 'CLAUDE', apiKey: 'sk-secret', model: 'claude-opus-5' }, 'bad-token'));

    expect(res.status).toBe(401);
  });

  it('rejects a student with 403 and an empty body, before touching the config table', async () => {
    queueRole('student');
    const res = await POST(req({ provider: 'CLAUDE', apiKey: 'sk-secret', model: 'claude-opus-5' }));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('instructor_llm_config');
  });

  it('rejects an account without a profile row', async () => {
    queue('user', { data: null, error: null });
    const res = await POST(req({ provider: 'CLAUDE', apiKey: 'sk-secret', model: 'claude-opus-5' }));

    expect(res.status).toBe(403);
  });

  it('answers 500 when the insert fails', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: null, error: { message: 'boom' } });

    const res = await POST(req({ provider: 'CLAUDE', apiKey: 'sk-secret', model: 'claude-opus-5' }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('boom');
  });

  it('answers 500 when the deactivate query fails', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: null, error: { message: 'deactivate failed' } });

    const res = await POST(req({ provider: 'CLAUDE', apiKey: 'sk-secret', model: 'claude-opus-5', setActive: true }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('deactivate failed');
  });

  it('answers 400 for invalid JSON', async () => {
    queueRole('instructor');
    const res = await POST(
      new Request('http://localhost/api/instructor/llm-config', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: '{not json',
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe('GET /api/instructor/llm-config', () => {
  it("returns the caller's own most recent config, api key never included", async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: configRow(), error: null });

    const res = await GET(getReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config).toEqual(configRow());
    expect(JSON.stringify(body)).not.toContain('api_key');

    expect(h.state.filters).toContainEqual({
      table: 'instructor_llm_config',
      column: 'user_id',
      value: 'instructor-1',
    });
  });

  it('returns { config: null } when the instructor has never saved one', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: null, error: null });

    const res = await GET(getReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ config: null });
  });

  it('answers 401 without a token', async () => {
    const res = await GET(getReq(null));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
    expect(h.state.tables).toEqual([]);
  });

  it('answers 401 for an invalid token', async () => {
    const res = await GET(getReq('bad-token'));

    expect(res.status).toBe(401);
  });

  it('rejects a student with 403 and an empty body', async () => {
    queueRole('student');
    const res = await GET(getReq());

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('instructor_llm_config');
  });

  it('rejects an account without a profile row', async () => {
    queue('user', { data: null, error: null });
    const res = await GET(getReq());

    expect(res.status).toBe(403);
  });

  it('filters by both provider and model when given', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: configRow({ provider: 'GEMINI', model: 'gemini-3.6-flash' }), error: null });

    const res = await GET(getReq('valid-token', '?provider=GEMINI&model=gemini-3.6-flash'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.config).toEqual(configRow({ provider: 'GEMINI', model: 'gemini-3.6-flash' }));

    expect(h.state.filters).toContainEqual({ table: 'instructor_llm_config', column: 'provider', value: 'GEMINI' });
    expect(h.state.filters).toContainEqual({
      table: 'instructor_llm_config',
      column: 'model',
      value: 'gemini-3.6-flash',
    });
  });

  it('returns { config: null } for a valid pair the instructor never saved', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: null, error: null });

    const res = await GET(getReq('valid-token', '?provider=CLAUDE&model=claude-sonnet-5'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ config: null });
  });

  it('rejects an invalid provider in the filter with 400', async () => {
    queueRole('instructor');
    const res = await GET(getReq('valid-token', '?provider=LLAMA&model=llama-4'));

    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('instructor_llm_config');
  });

  it('rejects provider without model with 400', async () => {
    queueRole('instructor');
    const res = await GET(getReq('valid-token', '?provider=CLAUDE'));

    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('instructor_llm_config');
  });

  it('rejects model without provider with 400', async () => {
    queueRole('instructor');
    const res = await GET(getReq('valid-token', '?model=claude-opus-5'));

    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('instructor_llm_config');
  });

  it('answers 500 when the query fails', async () => {
    queueRole('instructor');
    queue('instructor_llm_config', { data: null, error: { message: 'boom' } });

    const res = await GET(getReq());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('boom');
  });
});
