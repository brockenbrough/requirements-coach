import { describe, expect, it } from 'vitest';
import { formatStoryAsMarkdown } from '../../lib/storyMarkdown';

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
