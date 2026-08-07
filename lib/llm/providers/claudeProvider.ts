import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMRatingResult } from '../provider';
import { buildRatingPrompt, parseRatingResponse, RATING_JSON_SCHEMA } from '../promptUtils';

const DEFAULT_MODEL = 'claude-opus-5';

export class ClaudeProvider implements LLMProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  // instructor_llm_config.model is NOT NULL but not validated non-blank at save time — an
  // empty/whitespace value falls back to DEFAULT_MODEL rather than sending a blank model to
  // the API.
  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model?.trim() || DEFAULT_MODEL;
  }

  async rateAcceptanceCriteria(userStory: string, submittedText: string): Promise<LLMRatingResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RATING_JSON_SCHEMA } },
      messages: [{ role: 'user', content: buildRatingPrompt(userStory, submittedText) }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return parseRatingResponse(textBlock?.text ?? '');
  }
}