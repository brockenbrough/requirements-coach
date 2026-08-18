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
  inserts: [] as { table: string; payload: unknown }[],
  updates: [] as { table: string; payload: unknown; filters: { column: string; value: unknown }[] }[],
  deletes: [] as { table: string; filters: { column: string; value: unknown }[] }[],
  orders: [] as { table: string; column: string }[],
};

function resetState() {
  state.queues = {};
  state.inserts = [];
  state.updates = [];
  state.deletes = [];
  state.orders = [];
}

function queue(table: string, result: Result) {
  (state.queues[table] ??= []).push(result);
}

function makeBuilder(table: string, result: Result) {
  const filters: { column: string; value: unknown }[] = [];
  let pendingUpdatePayload: unknown = null;

  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (payload: unknown) => {
      state.inserts.push({ table, payload });
      return builder;
    },
    update: (payload: unknown) => {
      pendingUpdatePayload = payload;
      return builder;
    },
    delete: () => {
      state.deletes.push({ table, filters });
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push({ column, value });
      if (pendingUpdatePayload !== null) state.updates.push({ table, payload: pendingUpdatePayload, filters: [...filters] });
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
  beforeEach(resetState);

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
  beforeEach(resetState);

  // GitHub #464 follow-up: a plain upsert used to generate a fresh title_definition_id for every
  // row, including ones that already exist — Postgres's ON CONFLICT DO UPDATE puts every payload
  // column except the conflict target into the SET clause, so that was a real UPDATE to an
  // existing row's primary key. fk_user_title_definition (ON DELETE SET NULL, no ON UPDATE clause)
  // rejects that the moment a student has already selected the title. These tests assert the
  // insert/update split that avoids ever touching an existing row's id.

  it('inserts a genuinely new rung with a fresh id', async () => {
    queue('title_definition', { data: [], error: null }); // no existing row at this level

    const { error } = await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'Story Apprentice' },
    ]);

    expect(error).toBeNull();
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toEqual([
      {
        table: 'title_definition',
        payload: [
          expect.objectContaining({
            activity_type: 'TEST_CATALOG',
            difficulty_level: 1,
            title_name: 'Story Apprentice',
          }),
        ],
      },
    ]);
  });

  it("updates an existing rung by its own id, never touching title_definition_id", async () => {
    queue('title_definition', {
      data: [{ title_definition_id: 'existing-id-1', difficulty_level: 1 }],
      error: null,
    });

    const { error } = await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'Renamed Title' },
    ]);

    expect(error).toBeNull();
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toEqual([
      {
        table: 'title_definition',
        payload: { title_name: 'Renamed Title' },
        filters: [{ column: 'title_definition_id', value: 'existing-id-1' }],
      },
    ]);
  });

  it('inserts and updates in the same call when rungs are a mix of new and existing', async () => {
    queue('title_definition', {
      data: [{ title_definition_id: 'existing-id-2', difficulty_level: 2 }],
      error: null,
    });

    await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'New Rung' },
      { difficultyLevel: 2, titleName: 'Updated Rung' },
    ]);

    expect(state.inserts).toHaveLength(1);
    expect(state.updates).toHaveLength(1);
    expect((state.inserts[0].payload as { difficulty_level: number }[])[0].difficulty_level).toBe(1);
    expect(state.updates[0].filters).toEqual([{ column: 'title_definition_id', value: 'existing-id-2' }]);
  });

  it('deletes rungs that were cleared', async () => {
    queue('title_definition', { data: null, error: null });

    await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 2, titleName: null },
      { difficultyLevel: 3, titleName: null },
    ]);

    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
    expect(state.deletes[0].filters).toEqual([
      { column: 'activity_type', value: 'TEST_CATALOG' },
      { column: 'difficulty_level', value: [2, 3] },
    ]);
  });

  it('does both in one call when some rungs are set and others cleared', async () => {
    queue('title_definition', { data: [], error: null }); // existing-rows lookup for the filled rung
    queue('title_definition', { data: null, error: null }); // the delete

    await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'Story Apprentice' },
      { difficultyLevel: 2, titleName: null },
    ]);

    expect(state.inserts).toHaveLength(1);
    expect(state.deletes).toHaveLength(1);
  });

  it('touches nothing when given no rungs', async () => {
    const { error } = await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', []);

    expect(error).toBeNull();
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });

  it('stops and reports when the existing-rows lookup fails, without inserting, updating or deleting', async () => {
    queue('title_definition', { data: null, error: { message: 'select failed' } });

    const { error } = await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'Story Apprentice' },
      { difficultyLevel: 2, titleName: null },
    ]);

    expect(error).toEqual({ message: 'select failed' });
    expect(state.inserts).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });

  it('stops and reports when the insert fails, without running the delete', async () => {
    queue('title_definition', { data: [], error: null });
    queue('title_definition', { data: null, error: { message: 'insert failed' } });

    const { error } = await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'Story Apprentice' },
      { difficultyLevel: 2, titleName: null },
    ]);

    expect(error).toEqual({ message: 'insert failed' });
    expect(state.deletes).toHaveLength(0);
  });

  it('stops and reports when the update fails, without running the delete', async () => {
    queue('title_definition', { data: [{ title_definition_id: 'existing-id-1', difficulty_level: 1 }], error: null });
    queue('title_definition', { data: null, error: { message: 'update failed' } });

    const { error } = await saveTitleLadder(makeSupabase(), 'TEST_CATALOG', [
      { difficultyLevel: 1, titleName: 'Renamed' },
      { difficultyLevel: 2, titleName: null },
    ]);

    expect(error).toEqual({ message: 'update failed' });
    expect(state.deletes).toHaveLength(0);
  });
});

describe('listTitleNames', () => {
  beforeEach(resetState);

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
