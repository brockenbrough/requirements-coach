import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMRatingResult } from '../provider';
import { buildRatingPrompt, parseRatingResponse, RATING_JSON_SCHEMA } from '../promptUtils';

const MODEL = 'claude-opus-5';

export class ClaudeProvider implements LLMProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async rateAcceptanceCriteria(userStory: string, submittedText: string): Promise<LLMRatingResult> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RATING_JSON_SCHEMA } },
      messages: [{ role: 'user', content: buildRatingPrompt(userStory, submittedText) }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return parseRatingResponse(textBlock?.text ?? '');
  }
}