import { beforeEach, describe, expect, it } from 'vitest';
import { canWearTitle } from '../../lib/titleQueries';

type Result = { data?: unknown; error?: unknown };

// Same locally-built fake client as __tests__/lib/leaderboardQueries.test.ts and
// instructorAuth.test.ts: canWearTitle takes `supabase` as a plain argument, so there is nothing to
// vi.mock('../../lib/supabase') for.
const state = {
  queues: {} as Record<string, Result[]>,
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
    maybeSingle: async () => result,
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

function sessionRow(activityType: string, difficultyLevel: number, passed: boolean) {
  return { activity_type: activityType, difficulty_level: difficultyLevel, passed };
}

const STORIES = 'IDENTIFY_WEAK_USER_STORIES';
const CRITERIA = 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA';

describe('canWearTitle', () => {
  beforeEach(() => {
    state.queues = {};
    state.filters = [];
  });

  it('allows a title for a level the student has passed', async () => {
    queue('title_definition', { data: { activity_type: STORIES, difficulty_level: 2 }, error: null });
    queue('session_log', { data: [sessionRow(STORIES, 2, true)], error: null });

    expect(await canWearTitle(makeSupabase(), 'stu-1', 'title-2')).toEqual({ ok: true, reason: null, error: null });
  });

  // Sequential progression: passing level 3 implies 1 and 2 were passed too, so an earlier rung
  // stays wearable — the dropdown offers every earned rung, not just the highest.
  it('allows a lower title once a higher level in the same activity has been passed', async () => {
    queue('title_definition', { data: { activity_type: STORIES, difficulty_level: 1 }, error: null });
    queue('session_log', { data: [sessionRow(STORIES, 3, true)], error: null });

    expect((await canWearTitle(makeSupabase(), 'stu-1', 'title-1')).ok).toBe(true);
  });

  it('refuses a level the student has attempted but not passed', async () => {
    queue('title_definition', { data: { activity_type: STORIES, difficulty_level: 2 }, error: null });
    queue('session_log', { data: [sessionRow(STORIES, 2, false)], error: null });

    const verdict = await canWearTitle(makeSupabase(), 'stu-1', 'title-2');

    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('You have not earned that title yet.');
  });

  it('refuses a level the student has never reached', async () => {
    queue('title_definition', { data: { activity_type: STORIES, difficulty_level: 3 }, error: null });
    queue('session_log', { data: [sessionRow(STORIES, 1, true)], error: null });

    expect((await canWearTitle(makeSupabase(), 'stu-1', 'title-3')).ok).toBe(false);
  });

  // The passed level has to be in the title's OWN activity type — mastery in one quiz must not
  // unlock another quiz's titles.
  it('refuses when the passed level belongs to a different activity type', async () => {
    queue('title_definition', { data: { activity_type: STORIES, difficulty_level: 1 }, error: null });
    queue('session_log', { data: [sessionRow(CRITERIA, 3, true)], error: null });

    expect((await canWearTitle(makeSupabase(), 'stu-1', 'title-1')).ok).toBe(false);
  });

  it('refuses a student with no session history at all', async () => {
    queue('title_definition', { data: { activity_type: STORIES, difficulty_level: 1 }, error: null });
    queue('session_log', { data: [], error: null });

    expect((await canWearTitle(makeSupabase(), 'stu-1', 'title-1')).ok).toBe(false);
  });

  it('refuses an unknown title_definition_id without reading session_log', async () => {
    queue('title_definition', { data: null, error: null });

    const verdict = await canWearTitle(makeSupabase(), 'stu-1', 'no-such-title');

    expect(verdict).toEqual({ ok: false, reason: 'That title does not exist.', error: null });
    expect(state.filters.some((f) => f.table === 'session_log')).toBe(false);
  });

  it('scopes the session query to the caller, not to the id in the request', async () => {
    queue('title_definition', { data: { activity_type: STORIES, difficulty_level: 1 }, error: null });
    queue('session_log', { data: [sessionRow(STORIES, 1, true)], error: null });

    await canWearTitle(makeSupabase(), 'stu-1', 'title-1');

    expect(state.filters).toContainEqual({ table: 'session_log', column: 'user_id', value: 'stu-1' });
  });

  it('reports a database error rather than silently allowing the title', async () => {
    queue('title_definition', { data: null, error: { message: 'db down' } });

    const verdict = await canWearTitle(makeSupabase(), 'stu-1', 'title-1');

    expect(verdict.ok).toBe(false);
    expect(verdict.error).toEqual({ message: 'db down' });
  });
});
