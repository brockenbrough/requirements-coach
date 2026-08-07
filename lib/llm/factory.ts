import type { LLMProvider, LLMProviderName } from './provider';
import { isLLMProviderName } from './provider';
import { ClaudeProvider } from './providers/claudeProvider';
import { ChatGptProvider } from './providers/chatGptProvider';
import { GeminiProvider } from './providers/geminiProvider';

export type { LLMProviderName };
export { isLLMProviderName };

/**
 * Instantiates the configured LLM provider, or null if apiKey is missing —
 * mirrors getSupabaseClient()'s null-on-missing-config pattern (lib/supabase.ts).
 *
 * model is optional and instructor_llm_config-sourced: each provider class falls back to its
 * own hardcoded default when omitted or blank (see each provider's constructor).
 */
export function getLLMProvider(provider: LLMProviderName, apiKey: string, model?: string): LLMProvider | null {
  if (!apiKey) {
    return null;
  }

  switch (provider) {
    case 'CLAUDE':
      return new ClaudeProvider(apiKey, model);
    case 'CHATGPT':
      return new ChatGptProvider(apiKey, model);
    case 'GEMINI':
      return new GeminiProvider(apiKey, model);
  }
}