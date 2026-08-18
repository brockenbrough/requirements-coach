import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeCourseClassStats,
  computeAllOwnedCoursesClassStats,
  computeStudentCourseQuizProgress,
  computeMyCoursesQuizProgress,
} from '../../lib/courseQueries';

type Result = { data?: unknown; error?: unknown };

// Same filter-recording fake-client shape as __tests__/lib/courseScope.test.ts —
// computeCourseClassStats takes `supabase` as a plain argument, so a locally built fake is enough
// (no vi.mock needed). Filter recording (not just queued rows) is what lets these tests assert
// the query was scoped to the right activity_type/user_id set, since the fake doesn't apply
// filters itself — it always returns whatever was queued for that table.
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
    then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(result).then(onOk, onErr),
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
  state.filters = [];
});

describe('computeCourseClassStats', () => {
  it('counts started (any status) and passed (passed=true) students, deduped per student, and rounds percent', async () => {
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_A' }] }], error: null });
    queue('student_course', { data: [{ user_id: 'student-1' }, { user_id: 'student-2' }, { user_id: 'student-3' }], error: null });
    queue('session_log', {
      data: [
        { user_id: 'student-1', passed: false }, // in-progress/abandoned attempt — still "started"
        { user_id: 'student-1', passed: true }, // a later, passing attempt by the same student
        { user_id: 'student-2', passed: false },
      ],
      error: null,
    });

    const result = await computeCourseClassStats(makeSupabase(), 'course-1');

    expect(result).toEqual({
      stats: { totalStudents: 3, hasQuizzes: true, startedCount: 2, startedPercent: 67, passedCount: 1, passedPercent: 33 },
      error: null,
    });
  });

  it('scopes the session_log query to only this course\'s linked activity_types and enrolled students', async () => {
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_A' }] }], error: null });
    queue('student_course', { data: [{ user_id: 'student-1' }], error: null });
    queue('session_log', { data: [], error: null });

    await computeCourseClassStats(makeSupabase(), 'course-1');

    expect(state.filters).toContainEqual({ table: 'session_log', column: 'activity_type', value: ['TYPE_A'] });
    expect(state.filters).toContainEqual({ table: 'session_log', column: 'user_id', value: ['student-1'] });
  });

  it('counts the same attempt toward two different courses that each link the same catalog (known limitation, not a regression)', async () => {
    // session_log has no course_id/assembled_quiz_id column, only (user_id, activity_type) — see
    // computeCourseClassStats's own docblock. Two independent calls, each scoped to a different
    // course that happens to compose the same catalog, both legitimately see the same attempt.
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-A', assembled_quiz_catalog: [{ activity_type: 'SHARED_TYPE' }] }], error: null });
    queue('student_course', { data: [{ user_id: 'student-1' }], error: null });
    queue('session_log', { data: [{ user_id: 'student-1', passed: true }], error: null });
    const courseA = await computeCourseClassStats(makeSupabase(), 'course-A');

    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-B', assembled_quiz_catalog: [{ activity_type: 'SHARED_TYPE' }] }], error: null });
    queue('student_course', { data: [{ user_id: 'student-1' }], error: null });
    queue('session_log', { data: [{ user_id: 'student-1', passed: true }], error: null });
    const courseB = await computeCourseClassStats(makeSupabase(), 'course-B');

    expect(courseA.stats?.passedCount).toBe(1);
    expect(courseB.stats?.passedCount).toBe(1);
  });

  it('returns null percents and skips session_log when no students are enrolled', async () => {
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_A' }] }], error: null });
    queue('student_course', { data: [], error: null });

    const result = await computeCourseClassStats(makeSupabase(), 'course-1');

    expect(result).toEqual({
      stats: { totalStudents: 0, hasQuizzes: true, startedCount: 0, startedPercent: null, passedCount: 0, passedPercent: null },
      error: null,
    });
    expect(state.tables).not.toContain('session_log');
  });

  it('returns hasQuizzes: false, null percents, and skips session_log when the course has no quizzes', async () => {
    queue('assembled_quiz', { data: [], error: null });
    queue('student_course', { data: [{ user_id: 'student-1' }], error: null });

    const result = await computeCourseClassStats(makeSupabase(), 'course-1');

    expect(result).toEqual({
      stats: { totalStudents: 1, hasQuizzes: false, startedCount: 0, startedPercent: null, passedCount: 0, passedPercent: null },
      error: null,
    });
    expect(state.tables).not.toContain('session_log');
  });

  it('returns hasQuizzes: true but a real 0 percent (not null) when a quiz exists with no catalog linked yet', async () => {
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [] }], error: null });
    queue('student_course', { data: [{ user_id: 'student-1' }], error: null });

    const result = await computeCourseClassStats(makeSupabase(), 'course-1');

    expect(result).toEqual({
      stats: { totalStudents: 1, hasQuizzes: true, startedCount: 0, startedPercent: 0, passedCount: 0, passedPercent: 0 },
      error: null,
    });
    expect(state.tables).not.toContain('session_log');
  });

  it('surfaces a query error', async () => {
    queue('assembled_quiz', { data: null, error: { message: 'db down' } });
    queue('student_course', { data: [], error: null });

    const result = await computeCourseClassStats(makeSupabase(), 'course-1');

    expect(result).toEqual({ stats: null, error: { message: 'db down' } });
  });
});

describe('computeAllOwnedCoursesClassStats', () => {
  it('scopes each owned course independently', async () => {
    queue('course', { data: [{ course_id: 'course-A', course_name: 'Course A' }, { course_id: 'course-B', course_name: 'Course B' }], error: null });
    queue('assembled_quiz', { data: [], error: null }); // course-A: no quizzes
    queue('student_course', { data: [{ user_id: 'student-1' }], error: null }); // course-A: 1 enrolled
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_X' }] }], error: null }); // course-B: has a quiz
    queue('student_course', { data: [], error: null }); // course-B: nobody enrolled

    const result = await computeAllOwnedCoursesClassStats(makeSupabase(), 'instructor-1');

    expect(result).toEqual({
      stats: [
        { courseId: 'course-A', courseName: 'Course A', totalStudents: 1, hasQuizzes: false, startedCount: 0, startedPercent: null, passedCount: 0, passedPercent: null },
        { courseId: 'course-B', courseName: 'Course B', totalStudents: 0, hasQuizzes: true, startedCount: 0, startedPercent: null, passedCount: 0, passedPercent: null },
      ],
      error: null,
    });
    expect(state.tables).not.toContain('session_log');
  });

  it('returns an empty list without querying assembled_quiz/student_course when the instructor owns no courses', async () => {
    queue('course', { data: [], error: null });

    const result = await computeAllOwnedCoursesClassStats(makeSupabase(), 'instructor-1');

    expect(result).toEqual({ stats: [], error: null });
    expect(state.tables).toEqual(['course']);
  });
});

describe('computeStudentCourseQuizProgress', () => {
  it('counts this student\'s own passed activity_types out of the course\'s distinct catalog, deduped', async () => {
    queue('assembled_quiz', {
      data: [
        { assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_A' }, { activity_type: 'TYPE_B' }] },
        { assembled_quiz_id: 'quiz-2', assembled_quiz_catalog: [{ activity_type: 'TYPE_B' }] }, // TYPE_B shared across quizzes
      ],
      error: null,
    });
    queue('session_log', { data: [{ activity_type: 'TYPE_B' }], error: null });

    const result = await computeStudentCourseQuizProgress(makeSupabase(), 'course-1', 'student-1');

    expect(result).toEqual({
      progress: { hasQuizzes: true, totalQuizzes: 2, passedQuizzes: 1, progressPercent: 50 },
      error: null,
    });
  });

  it('scopes the session_log query to this student and this course\'s activity_types, filtered to passed=true', async () => {
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_A' }] }], error: null });
    queue('session_log', { data: [], error: null });

    await computeStudentCourseQuizProgress(makeSupabase(), 'course-1', 'student-1');

    expect(state.filters).toContainEqual({ table: 'session_log', column: 'user_id', value: 'student-1' });
    expect(state.filters).toContainEqual({ table: 'session_log', column: 'passed', value: true });
    expect(state.filters).toContainEqual({ table: 'session_log', column: 'activity_type', value: ['TYPE_A'] });
  });

  it('returns hasQuizzes: false and a null percent, skipping session_log, when the course has no quizzes', async () => {
    queue('assembled_quiz', { data: [], error: null });

    const result = await computeStudentCourseQuizProgress(makeSupabase(), 'course-1', 'student-1');

    expect(result).toEqual({
      progress: { hasQuizzes: false, totalQuizzes: 0, passedQuizzes: 0, progressPercent: null },
      error: null,
    });
    expect(state.tables).not.toContain('session_log');
  });

  it('returns hasQuizzes: true but a real 0 percent (not null) when a quiz exists with no catalog linked yet', async () => {
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [] }], error: null });

    const result = await computeStudentCourseQuizProgress(makeSupabase(), 'course-1', 'student-1');

    expect(result).toEqual({
      progress: { hasQuizzes: true, totalQuizzes: 0, passedQuizzes: 0, progressPercent: 0 },
      error: null,
    });
    expect(state.tables).not.toContain('session_log');
  });

  it('surfaces a query error', async () => {
    queue('assembled_quiz', { data: null, error: { message: 'db down' } });

    const result = await computeStudentCourseQuizProgress(makeSupabase(), 'course-1', 'student-1');

    expect(result).toEqual({ progress: null, error: { message: 'db down' } });
  });
});

describe('computeMyCoursesQuizProgress', () => {
  it('scopes each enrolled course independently, for the same student', async () => {
    queue('student_course', { data: [{ course_id: 'course-A' }, { course_id: 'course-B' }], error: null });
    queue('assembled_quiz', { data: [], error: null }); // course-A: no quizzes
    queue('assembled_quiz', { data: [{ assembled_quiz_id: 'quiz-1', assembled_quiz_catalog: [{ activity_type: 'TYPE_X' }] }], error: null }); // course-B
    queue('session_log', { data: [{ activity_type: 'TYPE_X' }], error: null }); // course-B: passed it

    const result = await computeMyCoursesQuizProgress(makeSupabase(), 'student-1');

    expect(result).toEqual({
      progress: [
        { courseId: 'course-A', hasQuizzes: false, totalQuizzes: 0, passedQuizzes: 0, progressPercent: null },
        { courseId: 'course-B', hasQuizzes: true, totalQuizzes: 1, passedQuizzes: 1, progressPercent: 100 },
      ],
      error: null,
    });
  });

  it('returns an empty list without querying assembled_quiz/session_log when the student is enrolled in nothing', async () => {
    queue('student_course', { data: [], error: null });

    const result = await computeMyCoursesQuizProgress(makeSupabase(), 'student-1');

    expect(result).toEqual({ progress: [], error: null });
    expect(state.tables).toEqual(['student_course']);
  });

  it('surfaces a query error from the enrollment lookup', async () => {
    queue('student_course', { data: null, error: { message: 'db down' } });

    const result = await computeMyCoursesQuizProgress(makeSupabase(), 'student-1');

    expect(result).toEqual({ progress: null, error: { message: 'db down' } });
  });
});
