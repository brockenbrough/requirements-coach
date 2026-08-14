import { describe, expect, it } from 'vitest';
import { pickRandomQuestions } from '../../lib/assembledQuizQueries';

type PoolItem = { question_id: string };

function pool(size: number): PoolItem[] {
  return Array.from({ length: size }, (_, i) => ({ question_id: `q-${i}` }));
}

describe('pickRandomQuestions', () => {
  it('returns exactly `count` items when the pool is larger', () => {
    const result = pickRandomQuestions(pool(10), 4);
    expect(result).toHaveLength(4);
  });

  it('returns every item, unpadded, when the pool is smaller than `count`', () => {
    const result = pickRandomQuestions(pool(2), 4);
    expect(result).toHaveLength(2);
  });

  it('returns exactly `count` items when the pool size matches', () => {
    const result = pickRandomQuestions(pool(4), 4);
    expect(result).toHaveLength(4);
  });

  it('never duplicates an item within one draw', () => {
    const result = pickRandomQuestions(pool(20), 4);
    const ids = result.map((item) => item.question_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only returns items that were actually in the pool', () => {
    const source = pool(10);
    const result = pickRandomQuestions(source, 4);
    const sourceIds = new Set(source.map((item) => item.question_id));

    for (const item of result) {
      expect(sourceIds.has(item.question_id)).toBe(true);
    }
  });

  it('does not mutate the input pool', () => {
    const source = pool(6);
    const copy = [...source];
    pickRandomQuestions(source, 4);
    expect(source).toEqual(copy);
  });

  it('returns an empty array for an empty pool', () => {
    expect(pickRandomQuestions([], 4)).toEqual([]);
  });

  it('draws different subsets across repeated calls (not deterministic)', () => {
    const source = pool(20);
    const draws = new Set(
      Array.from({ length: 20 }, () =>
        pickRandomQuestions(source, 4)
          .map((item) => item.question_id)
          .join(','),
      ),
    );

    expect(draws.size).toBeGreaterThan(1);
  });
});
