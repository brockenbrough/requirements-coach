import type { LLMRatingResult } from './provider';

// REQ-FU-2 (Write Acceptance Criteria): evaluate whether the acceptance criteria
// are clear, testable, and connected to the user story, then give feedback to
// help the student improve them. Score is 1-10 — a scale of its own for this
// free-text activity, separate from the Type A quiz's 100-point session score.
export function buildRatingPrompt(userStory: string, submittedText: string): string {
  return [
    'You are grading a student\'s submitted acceptance criteria for a user story.',
    'Evaluate whether the acceptance criteria are clear, testable, and connected to the user story.',
    'Give a score from 1 to 10 and feedback that helps the student improve the acceptance criteria.',
    '',
    `User story: ${userStory}`,
    `Submitted acceptance criteria: ${submittedText}`,
  ].join('\n');
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