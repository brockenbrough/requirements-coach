import type { LLMProvider, LLMProviderName } from './provider';
import { ClaudeProvider } from './providers/claudeProvider';
import { ChatGptProvider } from './providers/chatGptProvider';
import { GeminiProvider } from './providers/geminiProvider';

export type LLMProviderName = 'CLAUDE' | 'CHATGPT' | 'GEMINI';

const LLM_PROVIDER_NAMES: readonly LLMProviderName[] = ['CLAUDE', 'CHATGPT', 'GEMINI'];

// instructor_llm_config.provider is a free-form text column, so a value read back from the
// database needs validating before it can be trusted as an LLMProviderName.
export function isLLMProviderName(value: unknown): value is LLMProviderName {
  return typeof value === 'string' && (LLM_PROVIDER_NAMES as readonly string[]).includes(value);
}

/**
 * Instantiates the configured LLM provider, or null if apiKey is missing —
 * mirrors getSupabaseClient()'s null-on-missing-config pattern (lib/supabase.ts).
 */
export function getLLMProvider(provider: LLMProviderName, apiKey: string): LLMProvider | null {
  if (!apiKey) {
    return null;
  }

  switch (provider) {
    case 'CLAUDE':
      return new ClaudeProvider(apiKey);
    case 'CHATGPT':
      return new ChatGptProvider(apiKey);
    case 'GEMINI':
      return new GeminiProvider(apiKey);
  }
}