import { describe, expect, it } from 'vitest';
import { deriveStoryTitle, formatStoryAsMarkdown } from '../../lib/storyMarkdown';

describe('deriveStoryTitle', () => {
  it('extracts the "I want to <goal>" clause as a title', () => {
    expect(deriveStoryTitle('As a shopper, I want to apply a promo code at checkout, so that a valid discount is reflected in my order total before I pay.')).toBe(
      'Apply a promo code at checkout',
    );
  });

  it('works without a "to" after "I want"', () => {
    expect(deriveStoryTitle('As a user, I want faster page loads, so that I do not get frustrated.')).toBe('Faster page loads');
  });

  it('is case-insensitive on "As a"/"I want"', () => {
    expect(deriveStoryTitle('as a user, i want to log in, so that i can access my account.')).toBe('Log in');
  });

  it('falls back to a generic label when the story does not follow the template', () => {
    expect(deriveStoryTitle('Users should be able to reset their password.')).toBe('User Story');
  });

  it('falls back to a generic label for an empty string', () => {
    expect(deriveStoryTitle('')).toBe('User Story');
  });
});

describe('formatStoryAsMarkdown', () => {
  it('formats title and description only when there are no acceptance criteria', () => {
    const markdown = formatStoryAsMarkdown({
      title: 'Apply a promo code at checkout',
      description: 'As a shopper, I want to apply a promo code at checkout, so that a valid discount is reflected in my order total before I pay.',
    });

    expect(markdown).toBe(
      '# Apply a promo code at checkout\n\n' +
        'As a shopper, I want to apply a promo code at checkout, so that a valid discount is reflected in my order total before I pay.',
    );
  });

  it('appends an Acceptance Criteria section, one bullet per non-empty line', () => {
    const markdown = formatStoryAsMarkdown({
      title: 'Apply a promo code',
      description: 'As a shopper, I want to apply a promo code, so that I get a discount.',
      acceptanceCriteria: 'Given a valid code, when applied, then the discount shows.\n\nGiven an invalid code, when applied, then an error shows.',
    });

    expect(markdown).toBe(
      '# Apply a promo code\n\n' +
        'As a shopper, I want to apply a promo code, so that I get a discount.\n\n' +
        '## Acceptance Criteria\n' +
        '- Given a valid code, when applied, then the discount shows.\n' +
        '- Given an invalid code, when applied, then an error shows.',
    );
  });

  it('does not double up a leading "-" or "*" the student already typed', () => {
    const markdown = formatStoryAsMarkdown({
      title: 'T',
      description: 'D',
      acceptanceCriteria: '- Given a, when b, then c.\n* Given d, when e, then f.',
    });

    expect(markdown).toContain('- Given a, when b, then c.\n- Given d, when e, then f.');
  });

  it('omits the Acceptance Criteria section for blank or whitespace-only input', () => {
    expect(formatStoryAsMarkdown({ title: 'T', description: 'D', acceptanceCriteria: '   \n  ' })).toBe('# T\n\nD');
    expect(formatStoryAsMarkdown({ title: 'T', description: 'D' })).toBe('# T\n\nD');
  });
});
