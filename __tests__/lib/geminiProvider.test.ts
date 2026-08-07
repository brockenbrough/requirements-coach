import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../../lib/llm/providers/geminiProvider';

// Client-side-of-the-wire test: the only collaborator to fake is fetch, same reasoning as
// __tests__/lib/sessionClient.test.ts's stubFetch.
function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, status: number) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeminiProvider.rateAcceptanceCriteria', () => {
  it('does not send additionalProperties in the request schema', async () => {
    const spy = stubFetch(() =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: '{"score": 5, "feedback": "ok"}' }] } }] }, 200),
    );

    const provider = new GeminiProvider('test-key');
    await provider.rateAcceptanceCriteria('As a user...', 'Given a user...');

    const [, init] = spy.mock.calls[0];
    const body = JSON.parse(init.body as string);
    const schema = body.generationConfig.responseSchema;

    expect(schema).not.toHaveProperty('additionalProperties');
    expect(schema).toMatchObject({
      type: 'object',
      properties: { score: expect.any(Object), feedback: expect.any(Object) },
      required: ['score', 'feedback'],
    });
  });

  it('parses a successful response into score and feedback', async () => {
    stubFetch(() =>
      jsonResponse(
        { candidates: [{ content: { parts: [{ text: '{"score": 9, "feedback": "Clear."}' }] } }] },
        200,
      ),
    );

    const provider = new GeminiProvider('test-key');
    const result = await provider.rateAcceptanceCriteria('As a user...', 'Given a user...');

    expect(result).toEqual({ score: 9, feedback: 'Clear.' });
  });

  it('uses the given model in the request URL', async () => {
    const spy = stubFetch(() =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: '{"score": 5, "feedback": "ok"}' }] } }] }, 200),
    );

    const provider = new GeminiProvider('test-key', 'gemini-1.5-flash');
    await provider.rateAcceptanceCriteria('As a user...', 'Given a user...');

    const [url] = spy.mock.calls[0];
    expect(url).toContain('/models/gemini-1.5-flash:generateContent');
  });

  it('falls back to the default model when none, or a blank one, is given', async () => {
    const spy = stubFetch(() =>
      jsonResponse({ candidates: [{ content: { parts: [{ text: '{"score": 5, "feedback": "ok"}' }] } }] }, 200),
    );

    await new GeminiProvider('test-key').rateAcceptanceCriteria('As a user...', 'Given a user...');
    await new GeminiProvider('test-key', '   ').rateAcceptanceCriteria('As a user...', 'Given a user...');

    for (const call of spy.mock.calls) {
      expect(call[0]).toContain('/models/gemini-2.0-flash:generateContent');
    }
  });

  it('throws with the API error message on a non-ok response', async () => {
    stubFetch(() =>
      jsonResponse(
        { error: { message: 'Invalid JSON payload received. Unknown name "additionalProperties"...' } },
        400,
      ),
    );

    const provider = new GeminiProvider('test-key');

    await expect(provider.rateAcceptanceCriteria('As a user...', 'Given a user...')).rejects.toThrow(
      /additionalProperties/,
    );
  });
});
