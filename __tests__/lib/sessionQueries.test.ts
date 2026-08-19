import { beforeEach, describe, expect, it } from 'vitest';
import { findInProgressSession, findStartDifficultyLevel, loadCompletedAttempts } from '../../lib/sessionQueries';

// GitHub #583: findInProgressSession/findStartDifficultyLevel/loadCompletedAttempts all gained an
// optional assembledQuizId parameter — these tests verify the actual .eq('assembled_quiz_id', …)
// filter is (or isn't) applied, which the route-level test harnesses can't see since their .eq()
// is a no-op. Same local-fake-builder shape as __tests__/lib/activityCourseQueries.test.ts and
// __tests__/lib/scoreQueries.test.ts — these functions take `supabase` as a plain argument.

type Result = { data?: unknown; error?: unknown };

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
    order: () => builder,
    maybeSingle: async () => result,
    then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(result).then(onOk, onErr),
  };
  return builder;
}

function makeSupabase() {
  return {
    from: (table: string) => makeBuilder(table, state.queues[table]?.shift() ?? { data: null, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  state.queues = {};
  state.filters = [];
});

describe('findInProgressSession', () => {
  it('does not filter by assembled_quiz_id when none is given (matches the old, catalog-wide behavior)', async () => {
    queue('session_log', { data: null, error: null });

    await findInProgressSession(makeSupabase(), 'student-1', 'CUSTOM_QUIZ');

    expect(state.filters.some((f) => f.column === 'assembled_quiz_id')).toBe(false);
  });

  it('filters by assembled_quiz_id when one is given, so two quizzes on the same catalog get independent slots', async () => {
    queue('session_log', { data: null, error: null });

    await findInProgressSession(makeSupabase(), 'student-1', 'CUSTOM_QUIZ', 'quiz-a');

    expect(state.filters).toContainEqual({ table: 'session_log', column: 'assembled_quiz_id', value: 'quiz-a' });
  });
});

describe('findStartDifficultyLevel', () => {
  it('does not filter by assembled_quiz_id when none is given', async () => {
    queue('session_log', { data: [], error: null });

    await findStartDifficultyLevel(makeSupabase(), 'student-1', 'CUSTOM_QUIZ');

    expect(state.filters.some((f) => f.column === 'assembled_quiz_id')).toBe(false);
  });

  it('scopes progression to one quiz when assembledQuizId is given', async () => {
    // Only quiz-a's own passed level-2 session should count toward quiz-a's start level.
    queue('session_log', {
      data: [{ activity_type: 'CUSTOM_QUIZ', difficulty_level: 2, passed: true }],
      error: null,
    });

    const result = await findStartDifficultyLevel(makeSupabase(), 'student-1', 'CUSTOM_QUIZ', 'quiz-a');

    expect(state.filters).toContainEqual({ table: 'session_log', column: 'assembled_quiz_id', value: 'quiz-a' });
    expect(result.startLevel).toBe(3); // one past the passed level
  });
});

describe('loadCompletedAttempts', () => {
  it('does not filter by assembled_quiz_id when none is given', async () => {
    queue('session_log', { data: [], error: null });

    await loadCompletedAttempts(makeSupabase(), 'student-1', 'CUSTOM_QUIZ');

    expect(state.filters.some((f) => f.column === 'assembled_quiz_id')).toBe(false);
  });

  it('scopes history to one quiz when assembledQuizId is given', async () => {
    queue('session_log', { data: [], error: null });

    await loadCompletedAttempts(makeSupabase(), 'student-1', 'CUSTOM_QUIZ', 'quiz-b');

    expect(state.filters).toContainEqual({ table: 'session_log', column: 'assembled_quiz_id', value: 'quiz-b' });
  });
});
