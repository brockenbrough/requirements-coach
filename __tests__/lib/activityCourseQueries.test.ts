import { beforeEach, describe, expect, it } from 'vitest';
import { checkActivityAccess, getAccessibleCourseForActivity, listActivityTypesForCourses } from '../../lib/activityCourseQueries';

type Result = { data?: unknown; error?: unknown };

// Same fake-client shape as __tests__/lib/instructorAuth.test.ts — these functions take
// `supabase` as a plain argument, so a locally built fake is enough (no vi.mock needed).
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
    limit: () => builder,
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

describe('getAccessibleCourseForActivity', () => {
  it('returns null without querying assembled_quiz_catalog when the caller is enrolled in nothing', async () => {
    queue('student_course', { data: [], error: null });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result).toEqual({ link: null, error: null });
    expect(state.tables).not.toContain('assembled_quiz_catalog');
  });

  it('returns null when no assembled quiz in an enrolled course references the catalog', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', { data: [], error: null });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result).toEqual({ link: null, error: null });
  });

  it('returns the granting course when an assembled quiz in an enrolled course references the catalog', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [{ assembled_quiz: { course_id: 'course-1', course: { course_name: 'Intro to SE' } } }],
      error: null,
    });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result).toEqual({ link: { courseId: 'course-1', courseName: 'Intro to SE' }, error: null });
    expect(state.filters).toContainEqual({ table: 'assembled_quiz_catalog', column: 'activity_type', value: 'CUSTOM_QUIZ' });
    expect(state.filters).toContainEqual({ table: 'assembled_quiz_catalog', column: 'assembled_quiz.course_id', value: ['course-1'] });
  });

  it('falls back to a placeholder name if the embedded course is missing', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [{ assembled_quiz: { course_id: 'course-1', course: null } }],
      error: null,
    });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result.link).toEqual({ courseId: 'course-1', courseName: 'Unknown course' });
  });

  it('surfaces an enrolled-course lookup error', async () => {
    queue('student_course', { data: null, error: { message: 'db down' } });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result).toEqual({ link: null, error: { message: 'db down' } });
  });

  it('surfaces a quiz-catalog lookup error', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', { data: null, error: { message: 'db down' } });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result).toEqual({ link: null, error: { message: 'db down' } });
  });
});

describe('checkActivityAccess', () => {
  it('is forbidden when no course grants access', async () => {
    queue('student_course', { data: [], error: null });

    const result = await checkActivityAccess(makeSupabase(), 'UNLINKED', 'student-1');

    expect(result).toEqual({ status: 'forbidden' });
  });

  it('is ok when an enrolled course grants access through an assembled quiz', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [{ assembled_quiz: { course_id: 'course-1', course: { course_name: 'Intro to SE' } } }],
      error: null,
    });

    const result = await checkActivityAccess(makeSupabase(), 'LINKED', 'student-1');

    expect(result).toEqual({ status: 'ok' });
  });

  it('surfaces a lookup error', async () => {
    queue('student_course', { data: null, error: { message: 'db down' } });

    const result = await checkActivityAccess(makeSupabase(), 'LINKED', 'student-1');

    expect(result).toEqual({ status: 'error', error: { message: 'db down' } });
  });
});

describe('listActivityTypesForCourses', () => {
  it('short-circuits to an empty list without querying', async () => {
    const result = await listActivityTypesForCourses(makeSupabase(), []);

    expect(result).toEqual({ activities: [], error: null });
    expect(state.tables).toEqual([]);
  });

  it('maps every reachable activity with its catalog and granting-course info', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'CUSTOM_QUIZ',
          catalog: { quiz_name: 'Sprint 1 Check', description: 'Covers sprint basics', grading_kind: 'mcq' },
          assembled_quiz: { course_id: 'course-1', course: { course_name: 'Intro to SE' } },
        },
      ],
      error: null,
    });

    const result = await listActivityTypesForCourses(makeSupabase(), ['course-1']);

    expect(result).toEqual({
      activities: [
        {
          activityType: 'CUSTOM_QUIZ',
          name: 'Sprint 1 Check',
          description: 'Covers sprint basics',
          gradingKind: 'mcq',
          courseId: 'course-1',
          courseName: 'Intro to SE',
        },
      ],
      error: null,
    });
    expect(state.filters).toContainEqual({ table: 'assembled_quiz_catalog', column: 'assembled_quiz.course_id', value: ['course-1'] });
  });

  it('deduplicates a catalog reachable through more than one quiz, keeping the first match', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'CUSTOM_QUIZ',
          catalog: { quiz_name: 'Sprint 1 Check', description: null },
          assembled_quiz: { course_id: 'course-1', course: { course_name: 'Intro to SE' } },
        },
        {
          activity_type: 'CUSTOM_QUIZ',
          catalog: { quiz_name: 'Sprint 1 Check', description: null },
          assembled_quiz: { course_id: 'course-2', course: { course_name: 'Advanced SE' } },
        },
      ],
      error: null,
    });

    const result = await listActivityTypesForCourses(makeSupabase(), ['course-1', 'course-2']);

    expect(result.activities).toHaveLength(1);
    expect(result.activities?.[0].courseId).toBe('course-1');
  });

  it('surfaces a query error', async () => {
    queue('assembled_quiz_catalog', { data: null, error: { message: 'db down' } });

    const result = await listActivityTypesForCourses(makeSupabase(), ['course-1']);

    expect(result).toEqual({ activities: null, error: { message: 'db down' } });
  });

  // The field the student play flow branches on, so it has to survive this mapping intact.
  it('carries an llm-graded catalog kind through', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
          catalog: { quiz_name: 'Write Acceptance Criteria', description: null, grading_kind: 'llm-graded' },
          assembled_quiz: { course_id: 'course-1', course: { course_name: 'Intro to SE' } },
        },
      ],
      error: null,
    });

    const result = await listActivityTypesForCourses(makeSupabase(), ['course-1']);

    expect(result.activities?.[0].gradingKind).toBe('llm-graded');
  });

  // The column defaults to 'mcq' in the schema because every activity_type predating it drew from
  // question/answer; a row whose embed didn't resolve should land on the same side.
  it('falls back to mcq when the catalog embed is missing or unrecognised', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'ORPHANED',
          catalog: null,
          assembled_quiz: { course_id: 'course-1', course: { course_name: 'Intro to SE' } },
        },
        {
          activity_type: 'WEIRD',
          catalog: { quiz_name: 'Weird', description: null, grading_kind: 'peer-reviewed' },
          assembled_quiz: { course_id: 'course-1', course: { course_name: 'Intro to SE' } },
        },
      ],
      error: null,
    });

    const result = await listActivityTypesForCourses(makeSupabase(), ['course-1']);

    expect(result.activities?.map((a) => a.gradingKind)).toEqual(['mcq', 'mcq']);
  });
});
