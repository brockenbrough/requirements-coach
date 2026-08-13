import { beforeEach, describe, expect, it } from 'vitest';
import { computeCourseLeaderboard } from '../../lib/leaderboardQueries';

type Result = { data?: unknown; error?: unknown };

// Same fake-client shape as __tests__/lib/instructorAuth.test.ts — computeCourseLeaderboard
// takes `supabase` as a plain argument, so there is nothing to vi.mock('../../lib/supabase')
// for. Extended with `in` (session_log's roster-scoped fetch) alongside `eq`, both recorded so
// tests can assert what the query actually filtered on.
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
    in: (column: string, value: unknown) => {
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

function rosterRow(userId: string, username: string, avatarUrl: string | null = null, role = 'student') {
  return { user_id: userId, student: { username, avatar_url: avatarUrl, role } };
}

function sessionRow(
  userId: string,
  activityType: string,
  difficultyLevel: number,
  score: number,
  extra: { endedAt?: string | null; passed?: boolean } = {},
) {
  return {
    user_id: userId,
    activity_type: activityType,
    difficulty_level: difficultyLevel,
    cumulative_score: score,
    ended_at: extra.endedAt ?? null,
    passed: extra.passed ?? false,
  };
}

const COURSE_ID = 'course-1';

describe('computeCourseLeaderboard', () => {
  beforeEach(() => {
    state.queues = {};
    state.tables = [];
    state.filters = [];
  });

  it('returns an empty list, not an error, when nobody is enrolled', async () => {
    queue('student_course', { data: [], error: null });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result).toEqual({ data: [], error: null });
    // The session_log query never runs when there is no roster to score.
    expect(state.tables).not.toContain('session_log');
  });

  // AC: an enrolled student with zero completed sessions appears at 0 points, not missing.
  it('includes an enrolled student with no completed sessions at 0 points', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'newcomer')], error: null });
    queue('session_log', { data: [], error: null });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result).toEqual({
      data: [{ rank: 1, studentId: 'stu-1', username: 'newcomer', avatarUrl: null, points: 0, streak: 0 }],
      error: null,
    });
  });

  // AC: same best-per-(activity_type, difficulty_level) reducer as computeStudentScore — a
  // weaker retake doesn't change the total, only a higher one does.
  it('sums each student\'s best score per activity type and difficulty level, like computeStudentScore', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    queue('session_log', {
      data: [
        sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 75),
        sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 100),
        sessionRow('stu-1', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 1, 50),
      ],
      error: null,
    });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data).toEqual([{ rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: null, points: 150, streak: 0 }]);
  });

  // AC: completed, not passed — a finished attempt below the pass threshold still contributes.
  it('counts a completed session that was not passed', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    queue('session_log', { data: [sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 25)], error: null });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data).toEqual([{ rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: null, points: 25, streak: 0 }]);
  });

  // AC: streak reuses computeStreakFromSessions (lib/streakQueries.ts) over the passed=true
  // subset of the same rows points was already reduced from — no second query.
  it("computes each student's streak from their passed sessions, like computeStudentStreak", async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    queue('session_log', {
      data: [
        sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 100, { endedAt: '2026-08-01T10:00:00.000Z', passed: true }),
        sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 2, 100, { endedAt: '2026-08-02T10:00:00.000Z', passed: true }),
        // Not passed: contributes to points (if it were the best) but must not extend the streak.
        sessionRow('stu-1', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 1, 10, { endedAt: '2026-08-03T10:00:00.000Z', passed: false }),
      ],
      error: null,
    });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data?.[0].streak).toBe(2);
  });

  it('gives a student with no passed sessions a streak of 0, even with completed-but-failed ones', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    queue('session_log', {
      data: [sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 10, { endedAt: '2026-08-01T10:00:00.000Z', passed: false })],
      error: null,
    });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data?.[0].streak).toBe(0);
  });

  // AC: ties share a rank and the next rank skips (standard competition ranking, 1, 2, 2, 4).
  it('gives tied students the same rank and skips the next one', async () => {
    queue('student_course', {
      data: [rosterRow('stu-1', 'brockenbrough'), rosterRow('stu-2', 'anne'), rosterRow('stu-3', 'zed')],
      error: null,
    });
    queue('session_log', {
      data: [
        sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 100),
        sessionRow('stu-2', 'IDENTIFY_WEAK_USER_STORIES', 1, 100),
        sessionRow('stu-3', 'IDENTIFY_WEAK_USER_STORIES', 1, 50),
      ],
      error: null,
    });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data).toEqual([
      { rank: 1, studentId: 'stu-2', username: 'anne', avatarUrl: null, points: 100, streak: 0 },
      { rank: 1, studentId: 'stu-1', username: 'brockenbrough', avatarUrl: null, points: 100, streak: 0 },
      { rank: 3, studentId: 'stu-3', username: 'zed', avatarUrl: null, points: 50, streak: 0 },
    ]);
  });

  // AC: username is the deterministic secondary sort on a tie, so two requests can't disagree.
  it('breaks a tie by username ascending, deterministically', async () => {
    queue('student_course', {
      data: [rosterRow('stu-1', 'zed'), rosterRow('stu-2', 'anne'), rosterRow('stu-3', 'mid')],
      error: null,
    });
    queue('session_log', {
      data: [
        sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 100),
        sessionRow('stu-2', 'IDENTIFY_WEAK_USER_STORIES', 1, 100),
        sessionRow('stu-3', 'IDENTIFY_WEAK_USER_STORIES', 1, 100),
      ],
      error: null,
    });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data?.map((row) => row.studentId)).toEqual(['stu-2', 'stu-3', 'stu-1']);
  });

  // AC: only username/avatar_url leave "user" — no first/last name, age or semester.
  it('selects only username and avatar_url from the student embed', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada', 'https://example.com/a.png')], error: null });
    queue('session_log', { data: [], error: null });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data?.[0]).toEqual({ rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: 'https://example.com/a.png', points: 0, streak: 0 });
  });

  // AC: roster and session queries are both scoped to the given course/roster.
  it('scopes the roster query to the course and the role, and the session query to that roster', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada'), rosterRow('stu-2', 'bea')], error: null });
    queue('session_log', { data: [], error: null });

    await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(state.filters).toEqual([
      { table: 'student_course', column: 'course_id', value: COURSE_ID },
      { table: 'student_course', column: 'student.role', value: 'student' },
      { table: 'session_log', column: 'user_id', value: ['stu-1', 'stu-2'] },
      { table: 'session_log', column: 'status', value: 'completed' },
    ]);
  });

  it('returns the error and no data when the roster query fails', async () => {
    queue('student_course', { data: null, error: { message: 'db down' } });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result).toEqual({ data: null, error: { message: 'db down' } });
    expect(state.tables).not.toContain('session_log');
  });

  it('returns the error and no data when the session query fails', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    queue('session_log', { data: null, error: { message: 'db down' } });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result).toEqual({ data: null, error: { message: 'db down' } });
  });
});
