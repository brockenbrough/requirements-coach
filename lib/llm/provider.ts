export type LLMRatingResult = {
  score: number;
  feedback: string;
};

export interface LLMProvider {
  // customRubric is a catalog's own activity_type.rating_prompt, forwarded straight to
  // buildRatingPrompt — see its own doc comment (lib/llm/promptUtils.ts) for the fallback rule.
  rateAcceptanceCriteria(
    userStory: string,
    submittedText: string,
    customRubric?: string | null,
  ): Promise<LLMRatingResult>;
}

// The set of providers an instructor can configure (instructor_llm_config.provider). Kept in one
// place, same reasoning as lib/activityTypes.ts's ACTIVITY_TYPES, so getLLMProvider and any route
// validating a provider string never drift apart.
export const LLM_PROVIDERS = ['CLAUDE', 'CHATGPT', 'GEMINI'] as const;

export type LLMProviderName = (typeof LLM_PROVIDERS)[number];

export function isLLMProviderName(value: unknown): value is LLMProviderName {
  return typeof value === 'string' && (LLM_PROVIDERS as readonly string[]).includes(value);
}