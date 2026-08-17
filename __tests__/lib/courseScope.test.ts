import { beforeEach, describe, expect, it } from 'vitest';
import { resolveInstructorStudentIds } from '../../lib/courseScope';

type Result = { data?: unknown; error?: unknown };

// Same fake-client shape as __tests__/lib/activityCourseQueries.test.ts / instructorAuth.test.ts —
// resolveInstructorStudentIds takes `supabase` as a plain argument, so a locally built fake is
// enough (no vi.mock needed).
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

beforeEach(() => {
  state.queues = {};
  state.tables = [];
  state.filters = [];
});

describe('resolveInstructorStudentIds', () => {
  it('returns an empty list without querying student_course when the instructor owns no courses', async () => {
    queue('course', { data: [], error: null });

    const result = await resolveInstructorStudentIds(makeSupabase(), 'instructor-1');

    expect(result).toEqual({ studentIds: [], error: null });
    expect(state.tables).not.toContain('student_course');
    expect(state.filters).toContainEqual({ table: 'course', column: 'creator_id', value: 'instructor-1' });
  });

  it('returns an empty list when the instructor’s courses have no enrollees', async () => {
    queue('course', { data: [{ course_id: 'course-1' }], error: null });
    queue('student_course', { data: [], error: null });

    const result = await resolveInstructorStudentIds(makeSupabase(), 'instructor-1');

    expect(result).toEqual({ studentIds: [], error: null });
  });

  it('returns every distinct student across all owned courses', async () => {
    queue('course', { data: [{ course_id: 'course-A' }, { course_id: 'course-B' }], error: null });
    queue('student_course', {
      data: [{ user_id: 'student-1' }, { user_id: 'student-2' }],
      error: null,
    });

    const result = await resolveInstructorStudentIds(makeSupabase(), 'instructor-1');

    expect(result).toEqual({ studentIds: ['student-1', 'student-2'], error: null });
    expect(state.filters).toContainEqual({ table: 'student_course', column: 'course_id', value: ['course-A', 'course-B'] });
  });

  it('counts a student enrolled in two owned courses exactly once', async () => {
    queue('course', { data: [{ course_id: 'course-A' }, { course_id: 'course-B' }], error: null });
    queue('student_course', {
      data: [{ user_id: 'student-1' }, { user_id: 'student-1' }, { user_id: 'student-2' }],
      error: null,
    });

    const result = await resolveInstructorStudentIds(makeSupabase(), 'instructor-1');

    expect(result.studentIds).toEqual(['student-1', 'student-2']);
  });

  it('surfaces an owned-courses lookup error', async () => {
    queue('course', { data: null, error: { message: 'db down' } });

    const result = await resolveInstructorStudentIds(makeSupabase(), 'instructor-1');

    expect(result).toEqual({ studentIds: null, error: { message: 'db down' } });
  });

  it('surfaces an enrollment lookup error', async () => {
    queue('course', { data: [{ course_id: 'course-1' }], error: null });
    queue('student_course', { data: null, error: { message: 'db down' } });

    const result = await resolveInstructorStudentIds(makeSupabase(), 'instructor-1');

    expect(result).toEqual({ studentIds: null, error: { message: 'db down' } });
  });
});
