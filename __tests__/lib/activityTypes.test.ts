import { beforeEach, describe, expect, it } from 'vitest';
import {
  GRADING_KINDS,
  MAX_RATING_PROMPT_LENGTH,
  getGradingKind,
  isActivityType,
  isGradingKind,
  slugifyQuizName,
  validateRatingPromptText,
} from '../../lib/activityTypes';

type Result = { data?: unknown; error?: unknown };

// Same locally-built fake client as __tests__/lib/instructorAuth.test.ts: these helpers take
// `supabase` as a plain argument instead of calling getSupabaseClient() themselves, so there is
// nothing to vi.mock and a hand-built builder is enough. Recording selects/filters matters here
// because the point of getGradingKind is that it reads a *different* column than isActivityType.
const state = {
  queues: {} as Record<string, Result[]>,
  tables: [] as string[],
  selects: [] as { table: string; columns: string }[],
  filters: [] as { table: string; column: string; value: unknown }[],
};

function queue(table: string, result: Result) {
  (state.queues[table] ??= []).push(result);
}

function makeBuilder(table: string, result: Result) {
  const builder: Record<string, unknown> = {
    select: (columns: string) => {
      state.selects.push({ table, columns });
      return builder;
    },
    eq: (column: string, value: unknown) => {
      state.filters.push({ table, column, value });
      return builder;
    },
    is: (column: string, value: unknown) => {
      state.filters.push({ table, column, value });
      return builder;
    },
    maybeSingle: async () => result,
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

beforeEach(() => {
  state.queues = {};
  state.tables = [];
  state.selects = [];
  state.filters = [];
});

describe('isGradingKind', () => {
  it('accepts exactly the two kinds the CHECK constraint allows', () => {
    expect(GRADING_KINDS).toEqual(['mcq', 'llm-graded']);
    expect(isGradingKind('mcq')).toBe(true);
    expect(isGradingKind('llm-graded')).toBe(true);
  });

  it('rejects anything else, including near-misses and non-strings', () => {
    for (const value of ['MCQ', 'llm', 'llm_graded', '', ' mcq', null, undefined, 1, {}, ['mcq']]) {
      expect(isGradingKind(value)).toBe(false);
    }
  });
});

describe('getGradingKind', () => {
  it('returns the row grading_kind for a known activity type', async () => {
    queue('activity_type', { data: { grading_kind: 'llm-graded' }, error: null });

    const result = await getGradingKind(makeSupabase(), 'WRITE_ACCEPTANCE_CRITERIA');

    expect(result).toEqual({ gradingKind: 'llm-graded', error: null });
    expect(state.selects).toEqual([{ table: 'activity_type', columns: 'grading_kind' }]);
    expect(state.filters).toEqual([
      { table: 'activity_type', column: 'activity_type', value: 'WRITE_ACCEPTANCE_CRITERIA' },
      { table: 'activity_type', column: 'deleted_at', value: null },
    ]);
  });

  it('returns mcq for a built-in quiz', async () => {
    queue('activity_type', { data: { grading_kind: 'mcq' }, error: null });

    expect(await getGradingKind(makeSupabase(), 'IDENTIFY_WEAK_USER_STORIES')).toEqual({
      gradingKind: 'mcq',
      error: null,
    });
  });

  // The "unknown activity type" case: null kind AND null error, so a route can answer 400
  // rather than 500. This is the same split isActivityType uses.
  it('reports an unknown key as null without an error', async () => {
    queue('activity_type', { data: null, error: null });

    expect(await getGradingKind(makeSupabase(), 'NOPE')).toEqual({
      gradingKind: null,
      error: null,
    });
  });

  it('passes a database failure through so the caller can answer 500', async () => {
    queue('activity_type', { data: null, error: { message: 'connection reset' } });

    const result = await getGradingKind(makeSupabase(), 'IDENTIFY_WEAK_USER_STORIES');

    expect(result.gradingKind).toBeNull();
    expect(result.error).toEqual({ message: 'connection reset' });
  });

  it('never queries at all for a non-string or blank key', async () => {
    for (const value of [null, undefined, 42, '', '   ']) {
      expect(await getGradingKind(makeSupabase(), value)).toEqual({
        gradingKind: null,
        error: null,
      });
    }

    expect(state.tables).toEqual([]);
  });

  // Unreachable through Postgres thanks to ck_activity_type_grading_kind, but the safe direction
  // is to refuse rather than guess a grading path for a value we do not recognise.
  it('treats an unrecognised grading_kind value as unknown', async () => {
    queue('activity_type', { data: { grading_kind: 'peer-reviewed' }, error: null });

    expect(await getGradingKind(makeSupabase(), 'SOMETHING')).toEqual({
      gradingKind: null,
      error: null,
    });
  });

  // GitHub #525: excludes a soft-deleted catalog by default — the mock's own queued row doesn't
  // matter here, the point is that the query is filtered before the caller's fixture data would
  // even be consulted for a real database.
  it('filters out a soft-deleted catalog by default', async () => {
    queue('activity_type', { data: { grading_kind: 'llm-graded' }, error: null });

    await getGradingKind(makeSupabase(), 'WRITE_ACCEPTANCE_CRITERIA');

    expect(state.filters).toContainEqual({ table: 'activity_type', column: 'deleted_at', value: null });
  });

  it('does not filter by deleted_at when includeDeleted is true', async () => {
    queue('activity_type', { data: { grading_kind: 'llm-graded' }, error: null });

    const result = await getGradingKind(makeSupabase(), 'WRITE_ACCEPTANCE_CRITERIA', { includeDeleted: true });

    expect(result).toEqual({ gradingKind: 'llm-graded', error: null });
    expect(state.filters.some((f) => f.column === 'deleted_at')).toBe(false);
  });
});

describe('isActivityType', () => {
  it('still reads only the key column, so existing route mocks keep matching', async () => {
    queue('activity_type', { data: { activity_type: 'IDENTIFY_WEAK_USER_STORIES' }, error: null });

    const result = await isActivityType(makeSupabase(), 'IDENTIFY_WEAK_USER_STORIES');

    expect(result).toEqual({ valid: true, error: null });
    expect(state.selects).toEqual([{ table: 'activity_type', columns: 'activity_type' }]);
  });

  // GitHub #525
  it('filters out a soft-deleted catalog by default', async () => {
    queue('activity_type', { data: null, error: null });

    await isActivityType(makeSupabase(), 'IDENTIFY_WEAK_USER_STORIES');

    expect(state.filters).toContainEqual({ table: 'activity_type', column: 'deleted_at', value: null });
  });

  it('does not filter by deleted_at when includeDeleted is true, so a deleted catalog still counts as valid', async () => {
    queue('activity_type', { data: { activity_type: 'IDENTIFY_WEAK_USER_STORIES' }, error: null });

    const result = await isActivityType(makeSupabase(), 'IDENTIFY_WEAK_USER_STORIES', { includeDeleted: true });

    expect(result).toEqual({ valid: true, error: null });
    expect(state.filters.some((f) => f.column === 'deleted_at')).toBe(false);
  });

  it('never queries at all for a non-string or blank key, regardless of includeDeleted', async () => {
    for (const value of [null, undefined, 42, '', '   ']) {
      expect(await isActivityType(makeSupabase(), value, { includeDeleted: true })).toEqual({
        valid: false,
        error: null,
      });
    }

    expect(state.tables).toEqual([]);
  });
});

describe('validateRatingPromptText', () => {
  it('accepts and trims a normal string', () => {
    const result = validateRatingPromptText('  Score strictly on API-contract completeness.  ');
    expect(result).toEqual({ ok: true, ratingPrompt: 'Score strictly on API-contract completeness.' });
  });

  it('rejects a missing, non-string, or blank value with a message naming the field', async () => {
    for (const value of [undefined, null, 42, '', '   ']) {
      const result = validateRatingPromptText(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
        expect((await result.response.json()).error).toMatch(/ratingPrompt/);
      }
    }
  });

  it('rejects text longer than MAX_RATING_PROMPT_LENGTH, naming the limit', async () => {
    const result = validateRatingPromptText('x'.repeat(MAX_RATING_PROMPT_LENGTH + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect((await result.response.json()).error).toMatch(String(MAX_RATING_PROMPT_LENGTH));
    }
  });

  it('accepts text at exactly the length cap', () => {
    const result = validateRatingPromptText('x'.repeat(MAX_RATING_PROMPT_LENGTH));
    expect(result.ok).toBe(true);
  });
});

describe('slugifyQuizName', () => {
  it('produces keys shaped like the built-in ones', () => {
    expect(slugifyQuizName('Identify Weak User Stories')).toBe('IDENTIFY_WEAK_USER_STORIES');
    expect(slugifyQuizName('  Write, Acceptance-Criteria!  ')).toBe('WRITE_ACCEPTANCE_CRITERIA');
    expect(slugifyQuizName('!!!')).toBe('');
  });
});
