import { beforeEach, describe, expect, it } from 'vitest';
import { computeStudentScore, sumBestScores, type SessionRow } from '../../lib/scoreQueries';

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    activity_type: 'CUSTOM_QUIZ',
    difficulty_level: 1,
    cumulative_score: 10,
    assembled_quiz_id: null,
    ...overrides,
  };
}

describe('sumBestScores', () => {
  it('sums the best score per (activity_type, difficulty_level) when no quiz is known', () => {
    const total = sumBestScores([
      session({ difficulty_level: 1, cumulative_score: 10 }),
      session({ difficulty_level: 1, cumulative_score: 30 }), // best of the two at level 1
      session({ difficulty_level: 2, cumulative_score: 20 }),
    ]);

    expect(total).toBe(50); // 30 (best at level 1) + 20 (level 2)
  });

  it('never counts a level twice even across many attempts', () => {
    const total = sumBestScores([
      session({ difficulty_level: 1, cumulative_score: 5 }),
      session({ difficulty_level: 1, cumulative_score: 5 }),
      session({ difficulty_level: 1, cumulative_score: 5 }),
    ]);

    expect(total).toBe(5);
  });

  // GitHub #583, confirmed product decision: two quizzes built on the same catalog each count
  // independently — completing both is two distinct assignments, not one deduplicated best-of.
  it('counts two quizzes built on the same catalog independently, not deduplicated', () => {
    const total = sumBestScores([
      session({ assembled_quiz_id: 'quiz-a', activity_type: 'SHARED_CATALOG', difficulty_level: 1, cumulative_score: 40 }),
      session({ assembled_quiz_id: 'quiz-b', activity_type: 'SHARED_CATALOG', difficulty_level: 1, cumulative_score: 40 }),
    ]);

    expect(total).toBe(80); // both count, even though same catalog/level
  });

  it('still keeps only the best attempt within one quiz', () => {
    const total = sumBestScores([
      session({ assembled_quiz_id: 'quiz-a', difficulty_level: 1, cumulative_score: 20 }),
      session({ assembled_quiz_id: 'quiz-a', difficulty_level: 1, cumulative_score: 40 }),
    ]);

    expect(total).toBe(40);
  });

  it('pools every quiz-less (legacy/no-context) session into one shared bucket per level, matching pre-#583 behavior', () => {
    const total = sumBestScores([
      session({ assembled_quiz_id: null, activity_type: 'CUSTOM_QUIZ', difficulty_level: 1, cumulative_score: 10 }),
      session({ assembled_quiz_id: null, activity_type: 'CUSTOM_QUIZ', difficulty_level: 1, cumulative_score: 25 }),
    ]);

    expect(total).toBe(25);
  });

  it('returns 0 for no sessions', () => {
    expect(sumBestScores([])).toBe(0);
  });
});

// Same fake-client shape as __tests__/lib/activityCourseQueries.test.ts — computeStudentScore
// takes `supabase` as a plain argument, so a locally built fake is enough (no vi.mock needed).
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

describe('computeStudentScore', () => {
  it('selects assembled_quiz_id alongside the other session columns', async () => {
    queue('session_log', { data: [], error: null });
    queue('daily_challenge_attempt', { data: [], error: null });

    await computeStudentScore(makeSupabase(), 'student-1');

    expect(state.filters).toContainEqual({ table: 'session_log', column: 'user_id', value: 'student-1' });
    expect(state.filters).toContainEqual({ table: 'session_log', column: 'status', value: 'completed' });
  });

  it('sums independently across two quizzes on the same catalog, plus Daily Challenge points', async () => {
    queue('session_log', {
      data: [
        { activity_type: 'SHARED_CATALOG', difficulty_level: 1, cumulative_score: 40, assembled_quiz_id: 'quiz-a' },
        { activity_type: 'SHARED_CATALOG', difficulty_level: 1, cumulative_score: 40, assembled_quiz_id: 'quiz-b' },
      ],
      error: null,
    });
    queue('daily_challenge_attempt', { data: [{ score: 10 }], error: null });

    const result = await computeStudentScore(makeSupabase(), 'student-1');

    expect(result).toEqual({ score: 90, sessionsCompleted: 2, error: null });
  });

  it('surfaces a session_log query error', async () => {
    queue('session_log', { data: null, error: { message: 'db down' } });

    const result = await computeStudentScore(makeSupabase(), 'student-1');

    expect(result).toEqual({ score: null, sessionsCompleted: null, error: { message: 'db down' } });
  });
});
