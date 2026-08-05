import { beforeEach, describe, expect, it } from 'vitest';
import { requireInstructor } from '../../lib/instructorAuth';

type Result = { data?: unknown; error?: unknown };

// Same fake-client shape (queue-per-table, recorded tables/filters) as __tests__/api/score.test.ts
// — requireInstructor takes `supabase` as a plain argument rather than calling
// getSupabaseClient() itself, so there is nothing to vi.mock('../../lib/supabase') for here;
// a local object built the same way the other harnesses' from(table) builder works is enough.
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
    maybeSingle: async () => result,
  };
  return builder;
}

const AUTH_USER_ID = 'user-123';

function makeSupabase() {
  return {
    auth: {
      getUser: async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: AUTH_USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      state.tables.push(table);
      const result = state.queues[table]?.shift() ?? { data: null, error: null };
      return makeBuilder(table, result);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('requireInstructor', () => {
  beforeEach(() => {
    state.queues = {};
    state.tables = [];
    state.filters = [];
  });

  // AC: missing/malformed Authorization header.
  it('returns 401 for a missing token, without querying anything', async () => {
    const result = await requireInstructor(makeSupabase(), null);

    expect(result).toEqual({ ok: false, status: 401 });
    expect(state.tables).toEqual([]);
  });

  // AC: invalid or expired token.
  it('returns 401 for an invalid or expired token, without querying "user"', async () => {
    const result = await requireInstructor(makeSupabase(), 'bad-token');

    expect(result).toEqual({ ok: false, status: 401 });
    expect(state.tables).toEqual([]);
  });

  // AC: role is 'student' -> 403, and the guard never reaches a business-data query.
  it('returns 403 when the authenticated user’s role is student', async () => {
    queue('user', { data: { role: 'student' }, error: null });

    const result = await requireInstructor(makeSupabase(), 'valid-token');

    expect(result).toEqual({ ok: false, status: 403 });
    expect(state.tables).not.toContain('session_log');
  });

  // AC: no "user" row at all (never completed profile setup) -> treated as not-an-instructor, 403.
  it('returns 403 when no "user" row exists for the authenticated account', async () => {
    queue('user', { data: null, error: null });

    const result = await requireInstructor(makeSupabase(), 'valid-token');

    expect(result).toEqual({ ok: false, status: 403 });
    expect(state.tables).not.toContain('session_log');
  });

  it('returns 500 when the role lookup itself fails', async () => {
    queue('user', { data: null, error: { message: 'db down' } });

    const result = await requireInstructor(makeSupabase(), 'valid-token');

    expect(result).toEqual({ ok: false, status: 500 });
  });

  // AC: role is 'instructor' -> ok, with the user_id the route should use.
  it('returns ok with the user_id when the role is instructor', async () => {
    queue('user', { data: { role: 'instructor' }, error: null });

    const result = await requireInstructor(makeSupabase(), 'valid-token');

    expect(result).toEqual({ ok: true, user_id: AUTH_USER_ID });
  });

  // The role is read exclusively from "user", scoped to the token's own user_id — never a
  // caller-supplied id, the same rule every existing route follows.
  it('scopes the role lookup to the authenticated user', async () => {
    queue('user', { data: { role: 'instructor' }, error: null });

    await requireInstructor(makeSupabase(), 'valid-token');

    expect(state.filters).toEqual([{ table: 'user', column: 'user_id', value: AUTH_USER_ID }]);
  });
});
