import { beforeEach, describe, expect, it } from 'vitest';
import { computeStudentStreak } from '../../lib/streakQueries';

type Result = { data?: unknown; error?: unknown };

// Same fake-client shape (queue-per-table, recorded tables/filters) as __tests__/lib/instructorAuth.test.ts
// — computeStudentStreak takes `supabase` as a plain argument rather than calling
// getSupabaseClient() itself, so there is nothing to vi.mock('../../lib/supabase') for here; a
// local object built the same way is enough. The builder is thenable (see __tests__/api/score.test.ts)
// since this query has no .single().
const state = {
  queues: {} as Record<string, Result[]>,
  tables: [] as string[],
  filters: [] as { table: string; column: string; value: unknown }[],
};

function queue(table: string, result: Result) {
  (state.queues[table] ??= []).push(result);
}

function makeBuilder(result: Result) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      state.filters.push({ table: 'session_log', column, value });
      return builder;
    },
    order: () => builder,
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
      return makeBuilder(result);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const USER_ID = 'user-123';

/** Minutes-precision UTC timestamp, zone-less like the real session_log.ended_at column. */
function endedAt(iso: string) {
  return { ended_at: iso };
}

describe('computeStudentStreak', () => {
  beforeEach(() => {
    state.queues = {};
    state.tables = [];
    state.filters = [];
  });

  it('returns a streak of 0 when the student has no passed sessions', async () => {
    queue('session_log', { data: [], error: null });

    const result = await computeStudentStreak(makeSupabase(), USER_ID);

    expect(result).toEqual({ currentStreak: 0, error: null });
  });

  it('scopes the query to the student, completed status, and passed = true', async () => {
    queue('session_log', { data: [], error: null });

    await computeStudentStreak(makeSupabase(), USER_ID);

    expect(state.filters).toEqual([
      { table: 'session_log', column: 'user_id', value: USER_ID },
      { table: 'session_log', column: 'status', value: 'completed' },
      { table: 'session_log', column: 'passed', value: true },
    ]);
  });

  it('returns a streak of 1 for a single passed attempt (streak starting today)', async () => {
    queue('session_log', { data: [endedAt('2026-08-10T09:00:00')], error: null });

    const result = await computeStudentStreak(makeSupabase(), USER_ID);

    expect(result).toEqual({ currentStreak: 1, error: null });
  });

  it('counts a streak in progress across several consecutive days', async () => {
    queue('session_log', {
      data: [
        endedAt('2026-08-08T09:00:00'),
        endedAt('2026-08-09T10:00:00'),
        endedAt('2026-08-10T08:00:00'),
      ],
      error: null,
    });

    const result = await computeStudentStreak(makeSupabase(), USER_ID);

    expect(result).toEqual({ currentStreak: 3, error: null });
  });

  // REQ-GAM-BL-2.3: exactly 36h between two chronologically consecutive passed activities is
  // the worked example from the issue (Monday 08:00 -> Tuesday 20:00) — held, not broken.
  it('keeps the streak alive when the gap is exactly 36 hours', async () => {
    queue('session_log', {
      data: [endedAt('2026-08-10T08:00:00'), endedAt('2026-08-11T20:00:00')],
      error: null,
    });

    const result = await computeStudentStreak(makeSupabase(), USER_ID);

    expect(result).toEqual({ currentStreak: 2, error: null });
  });

  // One minute past 36h breaks the streak — the earlier day drops out of the current run.
  it('breaks the streak when the gap is just over 36 hours', async () => {
    queue('session_log', {
      data: [endedAt('2026-08-10T08:00:00'), endedAt('2026-08-11T20:01:00')],
      error: null,
    });

    const result = await computeStudentStreak(makeSupabase(), USER_ID);

    expect(result).toEqual({ currentStreak: 1, error: null });
  });

  // A break earlier in the history doesn't retroactively wipe the still-connected days after
  // it — only the days chronologically before the break drop out of the current, ongoing run.
  it('only keeps the days after the most recent break in the current streak', async () => {
    queue('session_log', {
      data: [
        endedAt('2026-08-08T08:00:00'), // isolated, > 36h before the next one
        endedAt('2026-08-10T09:00:00'), // gap from above > 36h -> breaks here
        endedAt('2026-08-11T09:00:00'), // gap from above ~24h -> stays connected
      ],
      error: null,
    });

    const result = await computeStudentStreak(makeSupabase(), USER_ID);

    expect(result).toEqual({ currentStreak: 2, error: null });
  });

  // REQ-GAM-BL-2.4: multiple passed activities on the same calendar day count as one streak day.
  it('does not double-count multiple passed activities on the same day', async () => {
    queue('session_log', {
      data: [
        endedAt('2026-08-09T08:00:00'),
        endedAt('2026-08-10T09:00:00'),
        endedAt('2026-08-10T14:00:00'), // same UTC day as the row above
        endedAt('2026-08-10T20:00:00'), // same UTC day again
      ],
      error: null,
    });

    const result = await computeStudentStreak(makeSupabase(), USER_ID);

    expect(result).toEqual({ currentStreak: 2, error: null });
  });

  it('marks a zone-less ended_at as UTC via toInstant rather than misreading it as local time', async () => {
    // Two rows 35h59m apart when read as UTC (as they must be, per CLAUDE.md's "Timestamps are
    // zone-less") stay within the grace period; misreading them as local time would shift the
    // gap and could flip this test's outcome depending on the host's timezone.
    queue('session_log', {
      data: [endedAt('2026-08-10T00:00:00'), endedAt('2026-08-11T11:59:00')],
      error: null,
    });

    const result = await computeStudentStreak(makeSupabase(), USER_ID);

    expect(result).toEqual({ currentStreak: 2, error: null });
  });

  it('returns the error when the session_log query fails', async () => {
    queue('session_log', { data: null, error: { message: 'db down' } });

    const result = await computeStudentStreak(makeSupabase(), USER_ID);

    expect(result).toEqual({ currentStreak: null, error: { message: 'db down' } });
  });
});
