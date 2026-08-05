import { describe, expect, it } from 'vitest';
import { shuffleArray } from '../../lib/shuffleArray';

describe('shuffleArray', () => {
  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4];
    const copy = [...input];
    shuffleArray(input);
    expect(input).toEqual(copy);
  });

  it('keeps every original element, with no loss or duplication', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const result = shuffleArray(input);

    expect(result).toHaveLength(input.length);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('returns an empty array unchanged', () => {
    expect(shuffleArray([])).toEqual([]);
  });

  it('produces different orderings across repeated calls (not deterministic)', () => {
    const input = Array.from({ length: 10 }, (_, i) => i);
    const orderings = new Set(Array.from({ length: 20 }, () => shuffleArray(input).join(',')));

    // With 10! possible orderings, landing on the exact same one all 20 times would indicate a
    // broken (non-random, or effectively no-op) shuffle rather than bad luck.
    expect(orderings.size).toBeGreaterThan(1);
  });

  it('can place any element first, not just the one already at index 0 (GitHub #129 regression check)', () => {
    // Mirrors the seed data's real bug: the correct answer was always inserted first, and
    // nothing downstream reordered it, so options[0] was always the correct one.
    const input = ['correct', 'wrong-1', 'wrong-2', 'wrong-3'];
    const firstPositions = new Set(Array.from({ length: 200 }, () => shuffleArray(input)[0]));

    expect(firstPositions.size).toBeGreaterThan(1);
  });
});
