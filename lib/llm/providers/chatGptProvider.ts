import type { LLMProvider, LLMRatingResult } from '../provider';
import { buildRatingPrompt, parseRatingResponse, RATING_JSON_SCHEMA } from '../promptUtils';

const DEFAULT_MODEL = 'gpt-4o-mini';

export class ChatGptProvider implements LLMProvider {
  private readonly model: string;

  // See ClaudeProvider's constructor comment: falls back to DEFAULT_MODEL on a blank model.
  constructor(private readonly apiKey: string, model?: string) {
    this.model = model?.trim() || DEFAULT_MODEL;
  }

  async rateAcceptanceCriteria(
    userStory: string,
    submittedText: string,
    customRubric?: string | null,
  ): Promise<LLMRatingResult> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: buildRatingPrompt(userStory, submittedText, customRubric) }],
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