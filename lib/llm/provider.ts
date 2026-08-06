export type LLMRatingResult = {
  score: number;
  feedback: string;
};

export interface LLMProvider {
  rateAcceptanceCriteria(userStory: string, submittedText: string): Promise<LLMRatingResult>;
}

// The set of providers an instructor can configure (instructor_llm_config.provider). Kept in one
// place, same reasoning as lib/activityTypes.ts's ACTIVITY_TYPES, so getLLMProvider and any route
// validating a provider string never drift apart.
export const LLM_PROVIDERS = ['CLAUDE', 'CHATGPT', 'GEMINI'] as const;

export type LLMProviderName = (typeof LLM_PROVIDERS)[number];

export function isLLMProviderName(value: unknown): value is LLMProviderName {
  return typeof value === 'string' && (LLM_PROVIDERS as readonly string[]).includes(value);
}