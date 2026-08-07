import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkLlmConfigForSelection, loadLlmConfig, saveLlmConfig } from '../../lib/instructorLlmConfigClient';

// Client-side-of-the-wire test, same reasoning as __tests__/lib/sessionClient.test.ts's
// stubFetch: the only collaborator to fake is fetch.

const TOKEN = 'instructor-token';

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, status: number) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const ROW = {
  instructor_llm_config_id: 'config-1',
  provider: 'CLAUDE',
  model: 'claude-opus-5',
  is_active: false,
  updated_at: '2026-08-07T10:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadLlmConfig', () => {
  it('translates a returned row into hasApiKey: true, sends the bearer token', async () => {
    const spy = stubFetch(() => jsonResponse({ config: ROW }, 200));

    const result = await loadLlmConfig(TOKEN);

    expect(result).toEqual({
      ok: true,
      data: { config: { provider: 'CLAUDE', model: 'claude-opus-5', hasApiKey: true, updatedAt: ROW.updated_at } },
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/instructor/llm-config');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('returns config: null when the instructor has no saved config', async () => {
    stubFetch(() => jsonResponse({ config: null }, 200));

    const result = await loadLlmConfig(TOKEN);

    expect(result).toEqual({ ok: true, data: { config: null } });
  });

  it('propagates a non-ok response as ok: false', async () => {
    stubFetch(() => jsonResponse({ error: 'Unauthorized' }, 401));

    const result = await loadLlmConfig(TOKEN);

    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });
});

describe('saveLlmConfig', () => {
  it('sends provider, model, and apiKey with the bearer token, translates the response', async () => {
    const spy = stubFetch(() => jsonResponse({ config: ROW }, 200));

    const result = await saveLlmConfig(TOKEN, 'CLAUDE', 'claude-opus-5', 'sk-secret');

    expect(result).toEqual({
      ok: true,
      data: { config: { provider: 'CLAUDE', model: 'claude-opus-5', hasApiKey: true, updatedAt: ROW.updated_at } },
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/instructor/llm-config');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({
      provider: 'CLAUDE',
      model: 'claude-opus-5',
      apiKey: 'sk-secret',
    });
  });

  it('propagates a non-ok response as ok: false', async () => {
    stubFetch(() => jsonResponse({ error: 'apiKey is required.' }, 400));

    const result = await saveLlmConfig(TOKEN, 'CLAUDE', 'claude-opus-5', '');

    expect(result).toEqual({ ok: false, status: 400, error: 'apiKey is required.' });
  });
});

describe('checkLlmConfigForSelection', () => {
  it('sends provider and model as a query string, translates a returned row', async () => {
    const spy = stubFetch(() => jsonResponse({ config: ROW }, 200));

    const result = await checkLlmConfigForSelection(TOKEN, 'CLAUDE', 'claude-opus-5');

    expect(result).toEqual({
      ok: true,
      data: { config: { provider: 'CLAUDE', model: 'claude-opus-5', hasApiKey: true, updatedAt: ROW.updated_at } },
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('/api/instructor/llm-config?provider=CLAUDE&model=claude-opus-5');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('returns config: null for a pair with no saved key', async () => {
    stubFetch(() => jsonResponse({ config: null }, 200));

    const result = await checkLlmConfigForSelection(TOKEN, 'GEMINI', 'gemini-3.6-flash');

    expect(result).toEqual({ ok: true, data: { config: null } });
  });

  it('propagates a non-ok response as ok: false', async () => {
    stubFetch(() => jsonResponse({ error: 'provider must be one of CLAUDE, CHATGPT, GEMINI.' }, 400));

    const result = await checkLlmConfigForSelection(TOKEN, 'CLAUDE', 'claude-opus-5');

    expect(result).toEqual({ ok: false, status: 400, error: 'provider must be one of CLAUDE, CHATGPT, GEMINI.' });
  });
});
