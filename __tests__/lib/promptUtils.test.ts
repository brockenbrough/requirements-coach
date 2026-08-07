import { describe, expect, it } from 'vitest';
import { buildRatingPrompt, parseRatingResponse } from '../../lib/llm/promptUtils';

describe('buildRatingPrompt', () => {
  it('returns exactly the submitted text, ignoring the user story', () => {
    expect(buildRatingPrompt('As a user, I want to log in.', 'Given a user...')).toBe(
      'Given a user...',
    );
  });

  it('is unaffected by an empty user story', () => {
    expect(buildRatingPrompt('', 'Given a user...')).toBe('Given a user...');
  });
});

describe('parseRatingResponse', () => {
  it('parses a well-formed rating', () => {
    expect(parseRatingResponse('{"score": 7, "feedback": "Good detail."}')).toEqual({
      score: 7,
      feedback: 'Good detail.',
    });
  });

  it('clamps an out-of-range score into [1, 10]', () => {
    expect(parseRatingResponse('{"score": 15, "feedback": "x"}').score).toBe(10);
    expect(parseRatingResponse('{"score": -3, "feedback": "x"}').score).toBe(1);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseRatingResponse('not json')).toThrow();
  });
});
