import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteTitleLadder,
  listTitleNames,
  loadTitleLadder,
  saveTitleLadder,
} from '../../lib/titleAuthoringQueries';

type Result = { data?: unknown; error?: unknown };

// Locally built fake client, the shape __tests__/lib/leaderboardQueries.test.ts uses: these
// functions take `supabase` as a plain argument, so there is nothing to vi.mock.
const state = {
  queues: {} as Record<string, Result[]>,
  upserts: [] as { table: string; payload: unknown; options: unknown }[],
  deletes: [] as { table: string; filters: { column: string; value: unknown }[] }[],
  orders: [] as { table: string; column: string }[],
};

function queue(table: string, result: Result) {
  (state.queues[table] ??= []).push(result);
}

function makeBuilder(table: string, result: Result) {
  const filters: { column: string; value: unknown }[] = [];

  const builder: Record<string, unknown> = {
    select: () => builder,
    upsert: (payload: unknown, options: unknown) => {
      state.upserts.push({ table, payload, options });
      return builder;
    },
    delete: () => {
      state.deletes.push({ table, filters });
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push({ column, value });
      return builder;
    },
    in: (column: string, value: unknown) => {
      filters.push({ column, value });
      return builder;
    },
    order: (column: string) => {
      state.orders.push({ table, column });
      return builder;
    },
    then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onOk, onErr),
  };

  return builder;
}

function makeSupabase() {
  return {
    from: (table: string) => makeBuilder(table, state.queues[table]?.shift() ?? { data: null, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('loadTitleLadder', () => {
  beforeEach(() => {
    state.queues = {};
    state.upserts = [];
    state.deletes = [];
    state.orders = [];
  });

  it('maps rows to the level/name shape, in level order', async () => {
    queue('title_definition', {
      data: [
        { difficulty_level: 1, title_name: 'Story Apprentice' },
        { difficulty_level: 2, title_name: 'Story Analyst' },
      ],
      error: null,
    });

    const { rungs, error } = await loadTitleLadder(makeSupabase(), 'TEST_CATALOG');

    expect(error).toBeNull();
    expect(rungs).toEqual([
      { difficultyLevel: 1, titleName: 'Story Apprentice' },
      { difficultyLevel: 2, titleName: 'Story Analyst' },
    ]);
    expect(state.orders).toContainEqual({ table: 'title_definition', column: 'difficulty_level' });
  });

  // The UI fills the gaps; the query must not invent placeholder rungs (see lib/masteryTitles.ts).
  it('returns [] for a catalog with no ladder', async () => {
    queue('title_definition', { data: [], error: null });
    expect((await loadTitleLadder(makeSupabase(), 'TEST_CATALOG')).rungs).toEqual([]);
  });

  it('reports a query error', async () => {
    queue('title_definition', { data: null, error: { message: 'db down' } });

    const { rungs, error } = await loadTitleLadder(makeSupabase(), 'TEST_CATALOG');

    expect(rungs).toBeNull();
    expect(error).toEqual({ message: 'db down' });
  });
});

describe('saveTitleLadder', () => {
  beforeEach(() => {
    state.queues = {};
    state.upserts = [];
    state.deletes = [];
    state.orders = [];
  });

  it('upserts filled rungs on the (activity_type, difficulty_level) unique key', async () => {
    queue('title_definition', { data: null, error: null });

    const { error } = await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'Story Apprentice' },
    ]);

    expect(error).toBeNull();
    const upsert = state.upserts[0];
    expect(upsert.table).toBe('title_definition');
    expect(upsert.options).toEqual({ onConflict: 'activity_type,difficulty_level' });
    expect(upsert.payload).toEqual([
      expect.objectContaining({
        activity_type: 'TEST_CATALOG',
        difficulty_level: 1,
        title_name: 'Story Apprentice',
      }),
    ]);
  });

  it('deletes rungs that were cleared', async () => {
    queue('title_definition', { data: null, error: null });

    await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 2, titleName: null },
      { difficultyLevel: 3, titleName: null },
    ]);

    expect(state.upserts).toHaveLength(0);
    expect(state.deletes[0].filters).toEqual([
      { column: 'activity_type', value: 'TEST_CATALOG' },
      { column: 'difficulty_level', value: [2, 3] },
    ]);
  });

  it('does both in one call when some rungs are set and others cleared', async () => {
    queue('title_definition', { data: null, error: null });
    queue('title_definition', { data: null, error: null });

    await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'Story Apprentice' },
      { difficultyLevel: 2, titleName: null },
    ]);

    expect(state.upserts).toHaveLength(1);
    expect(state.deletes).toHaveLength(1);
  });

  it('touches nothing when given no rungs', async () => {
    const { error } = await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', []);

    expect(error).toBeNull();
    expect(state.upserts).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });

  it('stops and reports when the upsert fails, without running the delete', async () => {
    queue('title_definition', { data: null, error: { message: 'upsert failed' } });

    const { error } = await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'Story Apprentice' },
      { difficultyLevel: 2, titleName: null },
    ]);

    expect(error).toEqual({ message: 'upsert failed' });
    expect(state.deletes).toHaveLength(0);
  });
});

describe('listTitleNames', () => {
  beforeEach(() => {
    state.queues = {};
    state.upserts = [];
    state.deletes = [];
    state.orders = [];
  });

  it('de-duplicates names used by more than one catalog', async () => {
    queue('title_definition', {
      data: [
        { title_name: 'Story Apprentice' },
        { title_name: 'Story Apprentice' },
        { title_name: 'Story Analyst' },
      ],
      error: null,
    });

    const { titleNames } = await listTitleNames(makeSupabase());

    expect(titleNames).toEqual(['Story Apprentice', 'Story Analyst']);
  });

  it('reports a query error', async () => {
    queue('title_definition', { data: null, error: { message: 'db down' } });

    const { titleNames, error } = await listTitleNames(makeSupabase());

    expect(titleNames).toBeNull();
    expect(error).toEqual({ message: 'db down' });
  });
});

describe('deleteTitleLadder', () => {
  beforeEach(() => {
    state.queues = {};
    state.deletes = [];
  });

  it('deletes every rung of one catalog', async () => {
    queue('title_definition', { data: null, error: null });

    await deleteTitleLadder(makeSupabase(), 'TEST_CATALOG');

    expect(state.deletes[0]).toEqual({
      table: 'title_definition',
      filters: [{ column: 'activity_type', value: 'TEST_CATALOG' }],
    });
  });
});
