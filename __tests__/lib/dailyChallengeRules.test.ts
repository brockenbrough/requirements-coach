import { describe, expect, it } from 'vitest';
import { nextChallengeAt } from '../../lib/dailyChallengeRules';

describe('nextChallengeAt', () => {
  it('returns the start of the UTC calendar day after challengeDate', () => {
    expect(nextChallengeAt('2026-08-14').toISOString()).toBe('2026-08-15T00:00:00.000Z');
  });

  it('rolls over the month/year boundary correctly', () => {
    expect(nextChallengeAt('2026-12-31').toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
