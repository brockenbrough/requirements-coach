import type { LLMRatingResult } from './provider';

// REQ-FU-2 (Write Acceptance Criteria): test-mode prompt — sends exactly what the student
// typed into the input field, nothing else. userStory is intentionally unused; each
// provider still requests structured output via RATING_JSON_SCHEMA (output_config /
// response_format / responseSchema), which is what keeps score/feedback populated
// regardless of what the prompt itself says.
export function buildRatingPrompt(_userStory: string, submittedText: string): string {
  return submittedText;
}

export const RATING_JSON_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 1, maximum: 10 },
    feedback: { type: 'string' },
  },
  required: ['score', 'feedback'],
  additionalProperties: false,
} as const;

/** Parses a provider's raw JSON text into an LLMRatingResult, clamping score to [1, 10]. */
export function parseRatingResponse(rawText: string): LLMRatingResult {
  const parsed = JSON.parse(rawText);
  const score = Math.min(10, Math.max(1, Math.round(Number(parsed.score))));
  const feedback = String(parsed.feedback);
  return { score, feedback };
}