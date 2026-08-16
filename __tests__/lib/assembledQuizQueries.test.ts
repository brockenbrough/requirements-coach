import { describe, expect, it } from 'vitest';
import { loadCatalogQuestionPool, pickRandomQuestions } from '../../lib/assembledQuizQueries';

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

// Same fake-client shape as __tests__/lib/instructorAuth.test.ts — loadCatalogQuestionPool takes
// `supabase` as a plain argument, so there is nothing to vi.mock('../../lib/supabase') for here.
function makeSupabase(questionRows: { question_id: string; max_score: number | null; activity_type: string }[]) {
  const filters: { column: string; value: unknown }[] = [];

  const builder = {
    select: () => builder,
    in: (column: string, value: unknown) => {
      filters.push({ column, value });
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push({ column, value });
      return builder;
    },
    then: (onOk: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: questionRows, error: null }).then(onOk),
  };

  return {
    filters,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: () => builder } as any,
  };
}

describe('loadCatalogQuestionPool', () => {
  it('GitHub #361: never returns a question that this quiz has excluded', async () => {
    const { supabase } = makeSupabase([
      { question_id: 'q-1', max_score: 25, activity_type: 'CATALOG_A' },
      { question_id: 'q-2', max_score: 25, activity_type: 'CATALOG_A' },
      { question_id: 'q-3', max_score: 25, activity_type: 'CATALOG_B' },
    ]);

    const { pool, error } = await loadCatalogQuestionPool(supabase, ['CATALOG_A', 'CATALOG_B'], 1, ['q-2']);

    expect(error).toBeNull();
    expect(pool?.map((q) => q.question_id).sort()).toEqual(['q-1', 'q-3']);
  });

  it('returns the full pool when no questions are excluded', async () => {
    const { supabase } = makeSupabase([{ question_id: 'q-1', max_score: 25, activity_type: 'CATALOG_A' }]);

    const { pool } = await loadCatalogQuestionPool(supabase, ['CATALOG_A'], 1);

    expect(pool).toHaveLength(1);
  });

  it('filters by catalog and difficulty level, scoping the query rather than filtering client-side', async () => {
    const { supabase, filters } = makeSupabase([]);

    await loadCatalogQuestionPool(supabase, ['CATALOG_A', 'CATALOG_B'], 2, []);

    expect(filters).toContainEqual({ column: 'activity_type', value: ['CATALOG_A', 'CATALOG_B'] });
    expect(filters).toContainEqual({ column: 'difficulty_level', value: 2 });
  });

  it('composes with pickRandomQuestions to draw only from the non-excluded pool', async () => {
    const { supabase } = makeSupabase([
      { question_id: 'q-1', max_score: 25, activity_type: 'CATALOG_A' },
      { question_id: 'q-2', max_score: 25, activity_type: 'CATALOG_A' },
      { question_id: 'q-3', max_score: 25, activity_type: 'CATALOG_A' },
    ]);

    const { pool } = await loadCatalogQuestionPool(supabase, ['CATALOG_A'], 1, ['q-1', 'q-2']);
    const draw = pickRandomQuestions(pool ?? [], 4);

    expect(draw).toEqual([{ question_id: 'q-3', max_score: 25, activity_type: 'CATALOG_A' }]);
  });
});
