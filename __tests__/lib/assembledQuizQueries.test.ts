import { describe, expect, it } from 'vitest';
import {
  addExtraQuestionToQuiz,
  addExtraUserStoryToQuiz,
  excludeUserStoryFromQuiz,
  getQuizComposition,
  includeUserStoryInQuiz,
  listQuizExcludedUserStoryIds,
  listQuizExtraQuestionIds,
  listQuizExtraUserStoryIds,
  loadCatalogQuestionPool,
  pickRandomQuestions,
  removeExtraQuestionFromQuiz,
  removeExtraUserStoryFromQuiz,
} from '../../lib/assembledQuizQueries';

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

// GitHub #380: loadCatalogQuestionPool now runs a *second* query against `question` when
// extraQuestionIds is non-empty (the hand-picked set), so the single-result makeSupabase above
// can't tell the two calls apart — both hit the same table name. This mock resolves results in
// call order instead, and records each call's own filters separately.
function makeSequencedSupabase(...resultsInCallOrder: { question_id: string; max_score: number | null; activity_type: string }[][]) {
  let call = 0;
  const filtersByCall: { column: string; value: unknown }[][] = [];

  function makeBuilder() {
    const callFilters: { column: string; value: unknown }[] = [];
    const builder = {
      select: () => builder,
      in: (column: string, value: unknown) => {
        callFilters.push({ column, value });
        return builder;
      },
      eq: (column: string, value: unknown) => {
        callFilters.push({ column, value });
        return builder;
      },
      then: (onOk: (r: { data: unknown; error: null }) => unknown) => {
        filtersByCall.push(callFilters);
        const data = resultsInCallOrder[call] ?? [];
        call += 1;
        return Promise.resolve({ data, error: null }).then(onOk);
      },
    };
    return builder;
  }

  return {
    filtersByCall,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: () => makeBuilder() } as any,
  };
}

describe('loadCatalogQuestionPool with hand-picked questions (GitHub #380)', () => {
  it('adds hand-picked questions to the pool alongside the catalog-derived set', async () => {
    const { supabase } = makeSequencedSupabase(
      [{ question_id: 'q-1', max_score: 25, activity_type: 'CATALOG_A' }],
      [{ question_id: 'q-9', max_score: 25, activity_type: 'CATALOG_Z' }],
    );

    const { pool } = await loadCatalogQuestionPool(supabase, ['CATALOG_A'], 1, [], ['q-9']);

    expect(pool?.map((q) => q.question_id).sort()).toEqual(['q-1', 'q-9']);
  });

  it('deduplicates a question reachable both through a linked catalog and a hand-pick', async () => {
    const { supabase } = makeSequencedSupabase(
      [{ question_id: 'q-1', max_score: 25, activity_type: 'CATALOG_A' }],
      [{ question_id: 'q-1', max_score: 25, activity_type: 'CATALOG_A' }],
    );

    const { pool } = await loadCatalogQuestionPool(supabase, ['CATALOG_A'], 1, [], ['q-1']);

    expect(pool?.map((q) => q.question_id)).toEqual(['q-1']);
  });

  it('a hand-picked question still appears even when it is also excluded — hand-picking wins', async () => {
    // Catalog-derived query already has q-1 filtered out by excludedQuestionIds below; the
    // second (hand-pick) query returns it unconditionally, since exclusion is never applied to it.
    const { supabase } = makeSequencedSupabase(
      [], // catalog-derived: q-1 would be here, but the caller-side filter drops it before this mock even matters
      [{ question_id: 'q-1', max_score: 25, activity_type: 'CATALOG_A' }],
    );

    const { pool } = await loadCatalogQuestionPool(supabase, ['CATALOG_A'], 1, ['q-1'], ['q-1']);

    expect(pool?.map((q) => q.question_id)).toEqual(['q-1']);
  });

  it('does not query for hand-picked questions when extraQuestionIds is empty', async () => {
    const { supabase, filtersByCall } = makeSequencedSupabase([{ question_id: 'q-1', max_score: 25, activity_type: 'CATALOG_A' }]);

    await loadCatalogQuestionPool(supabase, ['CATALOG_A'], 1, []);

    expect(filtersByCall).toHaveLength(1);
  });

  it('filters the hand-picked query by id and difficulty level, not by catalog', async () => {
    const { supabase, filtersByCall } = makeSequencedSupabase([], []);

    await loadCatalogQuestionPool(supabase, ['CATALOG_A'], 2, [], ['q-9']);

    expect(filtersByCall[1]).toContainEqual({ column: 'question_id', value: ['q-9'] });
    expect(filtersByCall[1]).toContainEqual({ column: 'difficulty_level', value: 2 });
  });
});

// Same fake-client shape as __tests__/lib/activityCourseQueries.test.ts — a plain per-table
// FIFO queue, since these functions take `supabase` as an argument.
function makeQueuedSupabase() {
  const queues: Record<string, { data: unknown; error: unknown }[]> = {};
  const inserts: { table: string; payload: unknown }[] = [];
  const deletes: { table: string; column: string; value: unknown }[] = [];

  function queue(table: string, result: { data: unknown; error: unknown }) {
    (queues[table] ??= []).push(result);
  }

  function makeBuilder(table: string) {
    let isDelete = false;
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => {
        inserts.push({ table, payload });
        return builder;
      },
      delete: () => {
        isDelete = true;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        if (isDelete) deletes.push({ table, column, value });
        return builder;
      },
      in: () => builder,
      then: (onOk: (r: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) => {
        const result = queues[table]?.shift() ?? { data: null, error: null };
        return Promise.resolve(result).then(onOk, onErr);
      },
    };
    return builder;
  }

  return {
    queue,
    inserts,
    deletes,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: (table: string) => makeBuilder(table) } as any,
  };
}

describe('listQuizExtraQuestionIds / addExtraQuestionToQuiz / removeExtraQuestionFromQuiz (GitHub #380)', () => {
  it('listQuizExtraQuestionIds returns bare ids', async () => {
    const { supabase, queue } = makeQueuedSupabase();
    queue('assembled_quiz_extra_question', { data: [{ question_id: 'q-1' }, { question_id: 'q-2' }], error: null });

    const result = await listQuizExtraQuestionIds(supabase, 'quiz-1');

    expect(result).toEqual({ extraIds: ['q-1', 'q-2'], error: null });
  });

  it('addExtraQuestionToQuiz inserts a link row and never touches question/answer', async () => {
    const { supabase, queue, inserts } = makeQueuedSupabase();
    queue('assembled_quiz_extra_question', { data: null, error: null });

    const result = await addExtraQuestionToQuiz(supabase, 'quiz-1', 'q-1');

    expect(result).toEqual({ alreadyPicked: false, error: null });
    expect(inserts).toEqual([{ table: 'assembled_quiz_extra_question', payload: { assembled_quiz_id: 'quiz-1', question_id: 'q-1' } }]);
    expect(inserts.some((i) => i.table === 'question' || i.table === 'answer')).toBe(false);
  });

  it('addExtraQuestionToQuiz treats a repeat pick (23505) as success, not an error', async () => {
    const { supabase, queue } = makeQueuedSupabase();
    queue('assembled_quiz_extra_question', { data: null, error: { code: '23505', message: 'duplicate' } });

    const result = await addExtraQuestionToQuiz(supabase, 'quiz-1', 'q-1');

    expect(result).toEqual({ alreadyPicked: true, error: null });
  });

  it('addExtraQuestionToQuiz surfaces a non-duplicate error (e.g. 23503, bogus question id) as-is', async () => {
    const { supabase, queue } = makeQueuedSupabase();
    queue('assembled_quiz_extra_question', { data: null, error: { code: '23503', message: 'foreign key violation' } });

    const result = await addExtraQuestionToQuiz(supabase, 'quiz-1', 'does-not-exist');

    expect(result).toEqual({ alreadyPicked: false, error: { code: '23503', message: 'foreign key violation' } });
  });

  it("removeExtraQuestionFromQuiz deletes only the link row, scoped to this quiz, leaving the original question and other quizzes untouched", async () => {
    const { supabase, queue, deletes } = makeQueuedSupabase();
    queue('assembled_quiz_extra_question', { data: null, error: null });

    const result = await removeExtraQuestionFromQuiz(supabase, 'quiz-1', 'q-1');

    expect(result).toEqual({ error: null });
    expect(deletes).toEqual([
      { table: 'assembled_quiz_extra_question', column: 'assembled_quiz_id', value: 'quiz-1' },
      { table: 'assembled_quiz_extra_question', column: 'question_id', value: 'q-1' },
    ]);
  });

  it('removeExtraQuestionFromQuiz is idempotent: removing a question that was never hand-picked is still success', async () => {
    const { supabase, queue } = makeQueuedSupabase();
    queue('assembled_quiz_extra_question', { data: null, error: null }); // 0 rows matched, still no error

    const result = await removeExtraQuestionFromQuiz(supabase, 'quiz-1', 'never-picked');

    expect(result).toEqual({ error: null });
  });
});

describe('getQuizComposition — hand-picked questions (GitHub #380)', () => {
  it('reports hand-picked questions with their source catalog, independent of any linked catalog', async () => {
    const { supabase, queue } = makeQueuedSupabase();
    queue('assembled_quiz_catalog', { data: [], error: null }); // no linked catalogs at all
    queue('assembled_quiz_extra_question', { data: [{ question_id: 'q-9' }], error: null });
    queue('question', {
      data: [{ question_id: 'q-9', question_prompt: 'What is a stakeholder?', difficulty_level: 2, activity_type: 'CATALOG_Z', catalog: { quiz_name: 'Stakeholder Basics' } }],
      error: null,
    });

    const result = await getQuizComposition(supabase, 'quiz-1');

    expect(result.catalogs).toEqual([]);
    expect(result.activeCatalogQuestionIds).toEqual([]);
    expect(result.extraQuestions).toEqual([
      { questionId: 'q-9', questionText: 'What is a stakeholder?', level: 2, catalogActivityType: 'CATALOG_Z', catalogName: 'Stakeholder Basics' },
    ]);
    expect(result.levelCoverage?.find((l) => l.level === 2)?.available).toBe(1);
  });

  it('does not double-count a question reachable both via a linked catalog and a hand-pick', async () => {
    const { supabase, queue } = makeQueuedSupabase();
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'CATALOG_A', catalog: { quiz_name: 'Cat A', description: null } }], error: null });
    queue('question', { data: [{ question_id: 'q-1', activity_type: 'CATALOG_A', difficulty_level: 1 }], error: null }); // catalog-derived
    queue('quiz_excluded_question', { data: [], error: null });
    queue('assembled_quiz_extra_question', { data: [{ question_id: 'q-1' }], error: null }); // same q-1, hand-picked too
    queue('question', {
      data: [{ question_id: 'q-1', question_prompt: 'X', difficulty_level: 1, activity_type: 'CATALOG_A', catalog: { quiz_name: 'Cat A' } }],
      error: null,
    });

    const result = await getQuizComposition(supabase, 'quiz-1');

    expect(result.levelCoverage?.find((l) => l.level === 1)?.available).toBe(1);
    expect(result.extraQuestions).toHaveLength(1);
  });

  it('a question excluded from its catalog still counts toward coverage once hand-picked — hand-picking overrides exclusion', async () => {
    const { supabase, queue } = makeQueuedSupabase();
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'CATALOG_A', catalog: { quiz_name: 'Cat A', description: null } }], error: null });
    queue('question', { data: [{ question_id: 'q-1', activity_type: 'CATALOG_A', difficulty_level: 1 }], error: null });
    queue('quiz_excluded_question', { data: [{ question_id: 'q-1' }], error: null }); // excluded from the catalog
    queue('assembled_quiz_extra_question', { data: [{ question_id: 'q-1' }], error: null }); // AND hand-picked
    queue('question', {
      data: [{ question_id: 'q-1', question_prompt: 'X', difficulty_level: 1, activity_type: 'CATALOG_A', catalog: { quiz_name: 'Cat A' } }],
      error: null,
    });

    const result = await getQuizComposition(supabase, 'quiz-1');

    // The catalog's own view of itself is unaffected by hand-picking: still excluded there.
    expect(result.catalogs?.[0]).toMatchObject({ excludedCount: 1, activeCount: 0 });
    expect(result.activeCatalogQuestionIds).toEqual([]);
    // But the pool-facing coverage counts it anyway, because it's hand-picked.
    expect(result.levelCoverage?.find((l) => l.level === 1)?.available).toBe(1);
    expect(result.extraQuestions?.map((q) => q.questionId)).toEqual(['q-1']);
  });

  it('computes hand-picked questions and coverage even with zero linked catalogs, without querying question for the catalog side', async () => {
    const { supabase, queue } = makeQueuedSupabase();
    queue('assembled_quiz_catalog', { data: [], error: null });
    queue('assembled_quiz_extra_question', { data: [], error: null }); // nothing hand-picked either

    const result = await getQuizComposition(supabase, 'quiz-1');

    expect(result).toEqual({
      catalogs: [],
      levelCoverage: [
        { level: 1, available: 0, required: 4, sufficient: false },
        { level: 2, available: 0, required: 4, sufficient: false },
        { level: 3, available: 0, required: 4, sufficient: false },
      ],
      extraQuestions: [],
      extraUserStories: [],
      activeCatalogQuestionIds: [],
      activeCatalogUserStoryIds: [],
      error: null,
    });
  });

  // GitHub #416: a quiz's own questions_per_level, not the flat QUESTIONS_PER_SESSION default,
  // is what the coverage banner warns against.
  it('computes level coverage against the quiz\'s own questionsPerLevel when passed', async () => {
    const { supabase, queue } = makeQueuedSupabase();
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'CATALOG_A', catalog: { quiz_name: 'Cat A', description: null } }], error: null });
    queue('question', {
      data: [
        { question_id: 'q-1', activity_type: 'CATALOG_A', difficulty_level: 1 },
        { question_id: 'q-2', activity_type: 'CATALOG_A', difficulty_level: 1 },
      ],
      error: null,
    });
    queue('quiz_excluded_question', { data: [], error: null });
    queue('assembled_quiz_extra_question', { data: [], error: null });

    const result = await getQuizComposition(supabase, 'quiz-1', 2);

    expect(result.levelCoverage).toEqual([
      { level: 1, available: 2, required: 2, sufficient: true },
      { level: 2, available: 0, required: 2, sufficient: false },
      { level: 3, available: 0, required: 2, sufficient: false },
    ]);
  });
});
