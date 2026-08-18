import { beforeEach, describe, expect, it } from 'vitest';
import { computeCourseLeaderboard, computeGlobalLeaderboard } from '../../lib/leaderboardQueries';

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

function rosterRow(
  userId: string,
  username: string,
  avatarUrl: string | null = null,
  role = 'student',
  selectedTitle: string | null = null,
) {
  return {
    user_id: userId,
    student: {
      username,
      avatar_url: avatarUrl,
      role,
      // The embed PostgREST returns for fk_user_title_definition: an object when the student wears
      // a title, null when selected_title_definition_id is null.
      selected_title: selectedTitle === null ? null : { title_name: selectedTitle },
    },
  };
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

// Shape lib/activityCourseQueries.ts's listActivityTypesForCourses expects back from
// assembled_quiz_catalog — one row per activity_type linked to the course via some assembled
// quiz. The fake builder's .in() is a no-op recorder, not a real filter, so a test controls "does
// this activity_type belong to the course" purely by whether it queues a row for it here.
function catalogLinkRow(activityType: string, courseId: string = COURSE_ID) {
  return {
    activity_type: activityType,
    catalog: { quiz_name: activityType, description: null, grading_kind: 'mcq' },
    assembled_quiz: { course_id: courseId, quiz_name: activityType, description: null, course: { course_name: 'Course' } },
  };
}

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
      data: [{ rank: 1, studentId: 'stu-1', username: 'newcomer', avatarUrl: null, points: 0, streak: 0, title: null }],
      error: null,
    });
  });

  // AC: same best-per-(activity_type, difficulty_level) reducer as computeStudentScore — a
  // weaker retake doesn't change the total, only a higher one does.
  it('sums each student\'s best score per activity type and difficulty level, like computeStudentScore', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    queue('assembled_quiz_catalog', {
      data: [catalogLinkRow('IDENTIFY_WEAK_USER_STORIES'), catalogLinkRow('IDENTIFY_WEAK_ACCEPTANCE_CRITERIA')],
      error: null,
    });
    queue('session_log', {
      data: [
        sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 75),
        sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 100),
        sessionRow('stu-1', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 1, 50),
      ],
      error: null,
    });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data).toEqual([{ rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: null, points: 150, streak: 0, title: null }]);
  });

  // GitHub #432: the bug this scoping fixed — a student's session in an activity_type that
  // belongs to a *different* course must not count toward this course's leaderboard, even though
  // the old, unscoped query would have summed it in regardless of which course it came from.
  it("excludes a student's sessions from activity types that don't belong to this course", async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    // Only this course's own catalog is linked — OTHER_COURSE_ACTIVITY has no row here, meaning
    // no assembled quiz in *this* course composes it.
    queue('assembled_quiz_catalog', { data: [catalogLinkRow('IDENTIFY_WEAK_USER_STORIES')], error: null });
    queue('session_log', {
      data: [
        sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 100),
        // Earned in some other course the student is also enrolled in — must not inflate this
        // course's leaderboard the way the pre-#432 unscoped query did.
        sessionRow('stu-1', 'OTHER_COURSE_ACTIVITY', 1, 500),
      ],
      error: null,
    });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data).toEqual([{ rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: null, title: null, points: 100, streak: 0 }]);
  });

  // A course with no assembled quiz yet has no activity types of its own — every enrolled
  // student shows 0 points, even one with a long history elsewhere, rather than falling back to
  // their global total.
  it('gives every student 0 points when the course has no linked activity types yet', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    queue('assembled_quiz_catalog', { data: [], error: null });
    queue('session_log', { data: [sessionRow('stu-1', 'SOME_OTHER_ACTIVITY', 1, 999)], error: null });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data).toEqual([{ rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: null, title: null, points: 0, streak: 0 }]);
  });

  it('returns the error and no data when the course-activities query fails', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    queue('assembled_quiz_catalog', { data: null, error: { message: 'db down' } });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result).toEqual({ data: null, error: { message: 'db down' } });
    expect(state.tables).not.toContain('session_log');
  });

  // AC: completed, not passed — a finished attempt below the pass threshold still contributes.
  it('counts a completed session that was not passed', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada')], error: null });
    queue('assembled_quiz_catalog', { data: [catalogLinkRow('IDENTIFY_WEAK_USER_STORIES')], error: null });
    queue('session_log', { data: [sessionRow('stu-1', 'IDENTIFY_WEAK_USER_STORIES', 1, 25)], error: null });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data).toEqual([{ rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: null, points: 25, streak: 0, title: null }]);
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
    queue('assembled_quiz_catalog', { data: [catalogLinkRow('IDENTIFY_WEAK_USER_STORIES')], error: null });
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
      { rank: 1, studentId: 'stu-2', username: 'anne', avatarUrl: null, points: 100, streak: 0, title: null },
      { rank: 1, studentId: 'stu-1', username: 'brockenbrough', avatarUrl: null, points: 100, streak: 0, title: null },
      { rank: 3, studentId: 'stu-3', username: 'zed', avatarUrl: null, points: 50, streak: 0, title: null },
    ]);
  });

  // AC: username is the deterministic secondary sort on a tie, so two requests can't disagree.
  it('breaks a tie by username ascending, deterministically', async () => {
    queue('student_course', {
      data: [rosterRow('stu-1', 'zed'), rosterRow('stu-2', 'anne'), rosterRow('stu-3', 'mid')],
      error: null,
    });
    queue('assembled_quiz_catalog', { data: [catalogLinkRow('IDENTIFY_WEAK_USER_STORIES')], error: null });
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

  // AC: only username/avatar_url and the worn title leave "user" — no first/last name, age or
  // semester. The title is deliberately public: it is chosen to be displayed next to the name.
  it('selects only username, avatar_url and the worn title from the student embed', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada', 'https://example.com/a.png')], error: null });
    queue('session_log', { data: [], error: null });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data?.[0]).toEqual({ rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: 'https://example.com/a.png', points: 0, streak: 0, title: null });
  });

  it("carries through the title a student chose to wear", async () => {
    queue('student_course', {
      data: [rosterRow('stu-1', 'ada', null, 'student', 'Story Analyst')],
      error: null,
    });
    queue('session_log', { data: [], error: null });

    const result = await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(result.data?.[0].title).toBe('Story Analyst');
  });

  // AC: roster, course-activities, and session queries are all scoped to the given course/roster.
  it('scopes the roster query, the course-activities query, and the session query to that course/roster', async () => {
    queue('student_course', { data: [rosterRow('stu-1', 'ada'), rosterRow('stu-2', 'bea')], error: null });
    queue('assembled_quiz_catalog', { data: [], error: null });
    queue('session_log', { data: [], error: null });

    await computeCourseLeaderboard(makeSupabase(), COURSE_ID);

    expect(state.filters).toEqual([
      { table: 'student_course', column: 'course_id', value: COURSE_ID },
      { table: 'student_course', column: 'student.role', value: 'student' },
      { table: 'assembled_quiz_catalog', column: 'assembled_quiz.course_id', value: [COURSE_ID] },
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

function globalUserRow(userId: string, username: string, avatarUrl: string | null = null, selectedTitle: string | null = null) {
  return {
    user_id: userId,
    username,
    avatar_url: avatarUrl,
    selected_title: selectedTitle ? { title_name: selectedTitle } : null,
  };
}

describe('computeGlobalLeaderboard', () => {
  beforeEach(() => {
    state.queues = {};
    state.tables = [];
    state.filters = [];
  });

  // Confirmed deliberately (not a privacy oversight): a global leaderboard ranks every student
  // account, not just ones who share a course with the caller — see the function's own doc for
  // why an earlier, shared-course-scoped version was replaced.
  it('returns every student account, regardless of whether they share a course with anyone', async () => {
    queue('user', { data: [globalUserRow('stu-1', 'ada'), globalUserRow('stu-2', 'bea')], error: null });
    queue('session_log', {
      data: [sessionRow('stu-1', 'SOME_CATALOG', 1, 50), sessionRow('stu-2', 'UNRELATED_CATALOG', 1, 20)],
      error: null,
    });

    const result = await computeGlobalLeaderboard(makeSupabase());

    expect(result.data).toEqual([
      { rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: null, title: null, points: 50, streak: 0 },
      { rank: 2, studentId: 'stu-2', username: 'bea', avatarUrl: null, title: null, points: 20, streak: 0 },
    ]);
  });

  it("sums a student's score across every course they're in, not just one", async () => {
    queue('user', { data: [globalUserRow('stu-1', 'ada')], error: null });
    queue('session_log', {
      data: [sessionRow('stu-1', 'CATALOG_IN_COURSE_A', 1, 50), sessionRow('stu-1', 'CATALOG_IN_COURSE_B', 1, 20)],
      error: null,
    });

    const result = await computeGlobalLeaderboard(makeSupabase());

    expect(result.data).toEqual([{ rank: 1, studentId: 'stu-1', username: 'ada', avatarUrl: null, title: null, points: 70, streak: 0 }]);
  });

  it('includes a student with zero completed sessions at 0 points, not omitted', async () => {
    queue('user', { data: [globalUserRow('stu-1', 'newcomer')], error: null });
    queue('session_log', { data: [], error: null });

    const result = await computeGlobalLeaderboard(makeSupabase());

    expect(result.data).toEqual([{ rank: 1, studentId: 'stu-1', username: 'newcomer', avatarUrl: null, title: null, points: 0, streak: 0 }]);
  });

  it('scopes the roster query to student accounts only', async () => {
    queue('user', { data: [], error: null });

    await computeGlobalLeaderboard(makeSupabase());

    expect(state.filters).toEqual([{ table: 'user', column: 'role', value: 'student' }]);
    expect(state.tables).toEqual(['user']);
  });

  it('returns an empty list, without touching session_log, when there are no student accounts at all', async () => {
    queue('user', { data: [], error: null });

    const result = await computeGlobalLeaderboard(makeSupabase());

    expect(result).toEqual({ data: [], error: null });
    expect(state.tables).toEqual(['user']);
  });

  it('returns the error and no data when the roster query fails', async () => {
    queue('user', { data: null, error: { message: 'db down' } });

    const result = await computeGlobalLeaderboard(makeSupabase());

    expect(result).toEqual({ data: null, error: { message: 'db down' } });
    expect(state.tables).toEqual(['user']);
  });

  it('returns the error and no data when the session query fails', async () => {
    queue('user', { data: [globalUserRow('stu-1', 'ada')], error: null });
    queue('session_log', { data: null, error: { message: 'db down' } });

    const result = await computeGlobalLeaderboard(makeSupabase());

    expect(result).toEqual({ data: null, error: { message: 'db down' } });
  });
});
