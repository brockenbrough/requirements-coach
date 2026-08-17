import { beforeEach, describe, expect, it } from 'vitest';
import { loadUserStoryPool, nextUnansweredStoryPosition } from '../../lib/llmActivityQueries';
import type { SessionStorySlot } from '../../lib/llmActivityQueries';

type Result = { data?: unknown; error?: unknown };

// Locally built fake client, the shape __tests__/lib/instructorAuth.test.ts established for
// helpers that take `supabase` as an argument instead of calling getSupabaseClient() themselves.
// The recorded filters are the point of the loadUserStoryPool tests: the draw became level-scoped
// in GitHub #379, and "did it actually filter by level" is not observable from the return value.
const state = {
  queues: {} as Record<string, Result[]>,
  tables: [] as string[],
  filters: [] as { table: string; column: string; value: unknown }[],
};

function queue(table: string, result: Result) {
  (state.queues[table] ??= []).push(result);
}

function makeBuilder(table: string, result: Result) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      state.filters.push({ table, column, value });
      return builder;
    },
    then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onOk, onErr),
  };
  return builder;
}

function makeSupabase() {
  return {
    from: (table: string) => {
      state.tables.push(table);
      const result = state.queues[table]?.shift() ?? { data: null, error: null };
      return makeBuilder(table, result);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function slot(position: number, userStoryId: string): SessionStorySlot {
  return { position, userStoryId, description: `Prompt ${position}` };
}

beforeEach(() => {
  state.queues = {};
  state.tables = [];
  state.filters = [];
});

describe('nextUnansweredStoryPosition', () => {
  const stories = [slot(0, 'story-a'), slot(1, 'story-b'), slot(2, 'story-c')];

  it('returns the first position with no submission', () => {
    expect(nextUnansweredStoryPosition(stories, new Set())).toBe(0);
    expect(nextUnansweredStoryPosition(stories, new Set(['story-a']))).toBe(1);
    expect(nextUnansweredStoryPosition(stories, new Set(['story-a', 'story-b']))).toBe(2);
  });

  it('returns null once every prompt has been submitted', () => {
    expect(nextUnansweredStoryPosition(stories, new Set(['story-a', 'story-b', 'story-c']))).toBeNull();
  });

  // The pointer is derived, never stored, which is what makes multi-device resume conflict-free:
  // a gap in the middle is answered before anything after it, regardless of row order.
  it('picks the lowest unanswered position, not the first row', () => {
    const shuffled = [slot(2, 'story-c'), slot(0, 'story-a'), slot(1, 'story-b')];
    expect(nextUnansweredStoryPosition(shuffled, new Set(['story-a', 'story-c']))).toBe(1);
  });

  it('treats a submission for a prompt outside the session as irrelevant', () => {
    expect(nextUnansweredStoryPosition(stories, new Set(['story-z']))).toBe(0);
  });

  it('returns null for an empty draw', () => {
    expect(nextUnansweredStoryPosition([], new Set())).toBeNull();
  });
});

describe('loadUserStoryPool', () => {
  it('filters by both activity type and difficulty level', async () => {
    queue('user_story', { data: [{ user_story_id: 'story-1' }], error: null });

    const result = await loadUserStoryPool(makeSupabase(), 'MY_WRITING_TASK', 2);

    expect(result).toEqual({ pool: [{ user_story_id: 'story-1' }], error: null });
    expect(state.tables).toEqual(['user_story']);
    expect(state.filters).toEqual([
      { table: 'user_story', column: 'activity_type', value: 'MY_WRITING_TASK' },
      { table: 'user_story', column: 'difficulty_level', value: 2 },
    ]);
  });

  // An empty pool is a normal answer, not an error — the route turns "fewer than
  // STORIES_PER_SESSION" into its own 400 with the level named.
  it('returns an empty pool rather than null when the level has no prompts', async () => {
    queue('user_story', { data: [], error: null });

    expect(await loadUserStoryPool(makeSupabase(), 'MY_WRITING_TASK', 3)).toEqual({
      pool: [],
      error: null,
    });
  });

  it('treats a null data payload as an empty pool', async () => {
    queue('user_story', { data: null, error: null });

    expect(await loadUserStoryPool(makeSupabase(), 'MY_WRITING_TASK', 1)).toEqual({
      pool: [],
      error: null,
    });
  });

  it('passes a database failure through so the caller can answer 500', async () => {
    queue('user_story', { data: null, error: { message: 'DB down' } });

    const result = await loadUserStoryPool(makeSupabase(), 'MY_WRITING_TASK', 1);

    expect(result.pool).toBeNull();
    expect(result.error).toEqual({ message: 'DB down' });
  });
});
