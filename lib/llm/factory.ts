import type { LLMProvider, LLMProviderName } from './provider';
import { ClaudeProvider } from './providers/claudeProvider';
import { ChatGptProvider } from './providers/chatGptProvider';
import { GeminiProvider } from './providers/geminiProvider';

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