import type { LLMProvider, LLMRatingResult } from '../provider';
import { buildRatingPrompt, parseRatingResponse, RATING_JSON_SCHEMA } from '../promptUtils';

const MODEL = 'gpt-4o-mini';

export class ChatGptProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  async rateAcceptanceCriteria(userStory: string, submittedText: string): Promise<LLMRatingResult> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: buildRatingPrompt(userStory, submittedText) }],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'acceptance_criteria_rating', schema: RATING_JSON_SCHEMA },
        },
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.error?.message ?? `ChatGPT request failed with status ${response.status}`);
    }

    const rawText = body?.choices?.[0]?.message?.content ?? '';
    return parseRatingResponse(rawText);
  }
}