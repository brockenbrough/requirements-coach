import type { LLMProvider, LLMRatingResult } from '../provider';
import { buildRatingPrompt, parseRatingResponse, RATING_JSON_SCHEMA } from '../promptUtils';

const MODEL = 'gemini-2.0-flash';

export class GeminiProvider implements LLMProvider {
  constructor(private readonly apiKey: string) {}

  async rateAcceptanceCriteria(userStory: string, submittedText: string): Promise<LLMRatingResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildRatingPrompt(userStory, submittedText) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RATING_JSON_SCHEMA,
        },
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.error?.message ?? `Gemini request failed with status ${response.status}`);
    }

    const rawText = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return parseRatingResponse(rawText);
  }
}