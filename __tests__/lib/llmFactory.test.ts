import { describe, expect, it } from 'vitest';
import { getLLMProvider } from '../../lib/llm/factory';
import { ClaudeProvider } from '../../lib/llm/providers/claudeProvider';
import { ChatGptProvider } from '../../lib/llm/providers/chatGptProvider';
import { GeminiProvider } from '../../lib/llm/providers/geminiProvider';

describe('getLLMProvider', () => {
  it('returns null when apiKey is empty, mirroring getSupabaseClient()', () => {
    expect(getLLMProvider('CLAUDE', '')).toBeNull();
    expect(getLLMProvider('CHATGPT', '')).toBeNull();
    expect(getLLMProvider('GEMINI', '')).toBeNull();
  });

  it('does not throw when apiKey is missing', () => {
    expect(() => getLLMProvider('CLAUDE', '')).not.toThrow();
  });

  it('instantiates a ClaudeProvider for CLAUDE', () => {
    expect(getLLMProvider('CLAUDE', 'test-key')).toBeInstanceOf(ClaudeProvider);
  });

  it('instantiates a ChatGptProvider for CHATGPT', () => {
    expect(getLLMProvider('CHATGPT', 'test-key')).toBeInstanceOf(ChatGptProvider);
  });

  it('instantiates a GeminiProvider for GEMINI', () => {
    expect(getLLMProvider('GEMINI', 'test-key')).toBeInstanceOf(GeminiProvider);
  });

  it('every instantiated provider implements rateAcceptanceCriteria', () => {
    const providers = [
      getLLMProvider('CLAUDE', 'test-key'),
      getLLMProvider('CHATGPT', 'test-key'),
      getLLMProvider('GEMINI', 'test-key'),
    ];

    for (const provider of providers) {
      expect(provider).not.toBeNull();
      expect(typeof provider!.rateAcceptanceCriteria).toBe('function');
    }
  });

  it('returns a different provider instance on each call (not a singleton)', () => {
    const first = getLLMProvider('CLAUDE', 'test-key');
    const second = getLLMProvider('CLAUDE', 'test-key');
    expect(first).not.toBe(second);
  });
});