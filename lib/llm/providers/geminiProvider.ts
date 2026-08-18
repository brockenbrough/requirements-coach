import type { LLMProvider, LLMRatingResult } from '../provider';
import { buildRatingPrompt, parseRatingResponse, RATING_JSON_SCHEMA } from '../promptUtils';

const DEFAULT_MODEL = 'gemini-2.0-flash';

// Gemini's responseSchema only accepts a restricted OpenAPI-3.0-style subset (type,
// properties, required, enum, items, format, description, nullable, ...) — additionalProperties
// isn't part of it, and including it makes Google reject the whole request with a 400
// ("Unknown name \"additionalProperties\"...") before any generation happens.
const { additionalProperties: _additionalProperties, ...GEMINI_RATING_SCHEMA } = RATING_JSON_SCHEMA;

export class GeminiProvider implements LLMProvider {
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
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildRatingPrompt(userStory, submittedText, customRubric) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RATING_SCHEMA,
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