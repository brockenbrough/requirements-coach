import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkActivityAccess,
  getAccessibleCourseForActivity,
  listActivityTypesForCourses,
  listCoursesForActivityTypes,
} from '../../lib/activityCourseQueries';

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

  it('returns the granting course and the assembled quiz\'s own name/description', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          assembled_quiz: {
            course_id: 'course-1',
            quiz_name: 'Week 3 Review',
            description: 'Assembled for Week 3',
            course: { course_name: 'Intro to SE' },
          },
          catalog: { quiz_name: 'Sprint 1 Check', description: 'Covers sprint basics' },
        },
      ],
      error: null,
    });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result).toEqual({
      link: {
        courseId: 'course-1',
        courseName: 'Intro to SE',
        name: 'Week 3 Review',
        description: 'Assembled for Week 3',
      },
      error: null,
    });
    expect(state.filters).toContainEqual({ table: 'assembled_quiz_catalog', column: 'activity_type', value: 'CUSTOM_QUIZ' });
    expect(state.filters).toContainEqual({ table: 'assembled_quiz_catalog', column: 'assembled_quiz.course_id', value: ['course-1'] });
  });

  it('falls back to a placeholder name if the embedded course is missing', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Week 3 Review', description: null, course: null },
          catalog: { quiz_name: 'Sprint 1 Check', description: 'Covers sprint basics' },
        },
      ],
      error: null,
    });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result.link).toEqual({
      courseId: 'course-1',
      courseName: 'Unknown course',
      name: 'Week 3 Review',
      description: 'Covers sprint basics',
    });
  });

  it('falls back to the catalog description, not null, when the assembled quiz has none', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Week 3 Review', description: null, course: { course_name: 'Intro to SE' } },
          catalog: { quiz_name: 'Sprint 1 Check', description: 'Covers sprint basics' },
        },
      ],
      error: null,
    });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result.link?.description).toBe('Covers sprint basics');
  });

  it('surfaces an enrolled-course lookup error', async () => {
    queue('student_course', { data: null, error: { message: 'db down' } });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result).toEqual({ link: null, error: { message: 'db down' } });
  });

  // GitHub #416: POST /api/sessions reads this off the same row to size its draw, not a second lookup.
  it('carries the granting quiz\'s own questionsPerLevel through', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          assembled_quiz: {
            course_id: 'course-1',
            quiz_name: 'Week 3 Review',
            description: null,
            questions_per_level: 6,
            course: { course_name: 'Intro to SE' },
          },
          catalog: { quiz_name: 'Sprint 1 Check', description: null },
        },
      ],
      error: null,
    });

    const result = await getAccessibleCourseForActivity(makeSupabase(), 'CUSTOM_QUIZ', 'student-1');

    expect(result.link?.questionsPerLevel).toBe(6);
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
      data: [
        {
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Linked Quiz', description: null, course: { course_name: 'Intro to SE' } },
          catalog: { quiz_name: 'Sprint 1 Check', description: null },
        },
      ],
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

  it('maps every reachable activity with the assembled quiz\'s own name/description, not the catalog\'s', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'CUSTOM_QUIZ',
          catalog: { quiz_name: 'Sprint 1 Check', description: 'Covers sprint basics', grading_kind: 'mcq' },
          assembled_quiz: {
            course_id: 'course-1',
            quiz_name: 'Week 3 Review',
            description: 'Assembled for Week 3',
            course: { course_name: 'Intro to SE' },
          },
        },
      ],
      error: null,
    });

    const result = await listActivityTypesForCourses(makeSupabase(), ['course-1']);

    expect(result).toEqual({
      activities: [
        {
          activityType: 'CUSTOM_QUIZ',
          name: 'Week 3 Review',
          description: 'Assembled for Week 3',
          gradingKind: 'mcq',
          courseId: 'course-1',
          courseName: 'Intro to SE',
        },
      ],
      error: null,
    });
    expect(state.filters).toContainEqual({ table: 'assembled_quiz_catalog', column: 'assembled_quiz.course_id', value: ['course-1'] });
  });

  it('falls back to the catalog name/description when the assembled quiz has none', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'CUSTOM_QUIZ',
          catalog: { quiz_name: 'Sprint 1 Check', description: 'Covers sprint basics', grading_kind: 'mcq' },
          assembled_quiz: {
            course_id: 'course-1',
            quiz_name: null,
            description: null,
            course: { course_name: 'Intro to SE' },
          },
        },
      ],
      error: null,
    });

    const result = await listActivityTypesForCourses(makeSupabase(), ['course-1']);

    expect(result.activities?.[0].name).toBe('Sprint 1 Check');
    expect(result.activities?.[0].description).toBe('Covers sprint basics');
  });

  it('deduplicates a catalog reachable through more than one quiz, keeping the first match — including its name', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'CUSTOM_QUIZ',
          catalog: { quiz_name: 'Sprint 1 Check', description: null },
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Course 1 Sprint Check', description: null, course: { course_name: 'Intro to SE' } },
        },
        {
          activity_type: 'CUSTOM_QUIZ',
          catalog: { quiz_name: 'Sprint 1 Check', description: null },
          assembled_quiz: { course_id: 'course-2', quiz_name: 'Course 2 Sprint Check', description: null, course: { course_name: 'Advanced SE' } },
        },
      ],
      error: null,
    });

    const result = await listActivityTypesForCourses(makeSupabase(), ['course-1', 'course-2']);

    expect(result.activities).toHaveLength(1);
    expect(result.activities?.[0].courseId).toBe('course-1');
    expect(result.activities?.[0].name).toBe('Course 1 Sprint Check');
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

// GitHub #474: the reverse direction of listActivityTypesForCourses — "which courses is this
// catalog linked to", for the Instructor Dashboard's activity log.
describe('listCoursesForActivityTypes', () => {
  it('short-circuits to an empty map without querying', async () => {
    const result = await listCoursesForActivityTypes(makeSupabase(), []);

    expect(result.coursesByActivityType).toEqual(new Map());
    expect(result.quizNameByActivityType).toEqual(new Map());
    expect(state.tables).toEqual([]);
  });

  it('maps a catalog linked to a single course', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'CUSTOM_QUIZ',
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Sprint 1 Quiz', course: { course_name: 'Intro to SE' } },
        },
      ],
      error: null,
    });

    const result = await listCoursesForActivityTypes(makeSupabase(), ['CUSTOM_QUIZ']);

    expect(result.coursesByActivityType?.get('CUSTOM_QUIZ')).toEqual([{ courseId: 'course-1', courseName: 'Intro to SE' }]);
    expect(result.quizNameByActivityType?.get('CUSTOM_QUIZ')).toBe('Sprint 1 Quiz');
    expect(state.filters).toContainEqual({ table: 'assembled_quiz_catalog', column: 'activity_type', value: ['CUSTOM_QUIZ'] });
  });

  // Unlike listActivityTypesForCourses, this deliberately does NOT collapse to one course — a
  // catalog composed into more than one quiz across different courses is a real case, and the
  // instructor reviewing an attempt needs to see all of them, not just the first found.
  it('keeps every course a catalog is linked to, not just the first', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'CUSTOM_QUIZ',
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Sprint 1 Quiz', course: { course_name: 'Intro to SE' } },
        },
        {
          activity_type: 'CUSTOM_QUIZ',
          assembled_quiz: { course_id: 'course-2', quiz_name: 'Sprint 2 Quiz', course: { course_name: 'Advanced SE' } },
        },
      ],
      error: null,
    });

    const result = await listCoursesForActivityTypes(makeSupabase(), ['CUSTOM_QUIZ']);

    expect(result.coursesByActivityType?.get('CUSTOM_QUIZ')).toEqual([
      { courseId: 'course-1', courseName: 'Intro to SE' },
      { courseId: 'course-2', courseName: 'Advanced SE' },
    ]);
    // quizNameByActivityType, unlike coursesByActivityType, has no way to represent "more than
    // one" — it's the known, documented limitation (no assembled_quiz_id on session_log to say
    // which quiz actually granted a given attempt access): first quiz found wins.
    expect(result.quizNameByActivityType?.get('CUSTOM_QUIZ')).toBe('Sprint 1 Quiz');
  });

  it('deduplicates the same course reached through more than one assembled quiz', async () => {
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'CUSTOM_QUIZ',
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Sprint 1 Quiz', course: { course_name: 'Intro to SE' } },
        },
        {
          activity_type: 'CUSTOM_QUIZ',
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Sprint 1 Quiz', course: { course_name: 'Intro to SE' } },
        },
      ],
      error: null,
    });

    const result = await listCoursesForActivityTypes(makeSupabase(), ['CUSTOM_QUIZ']);

    expect(result.coursesByActivityType?.get('CUSTOM_QUIZ')).toEqual([{ courseId: 'course-1', courseName: 'Intro to SE' }]);
  });

  it('has no entry for a catalog with no assembled_quiz link at all', async () => {
    queue('assembled_quiz_catalog', { data: [], error: null });

    const result = await listCoursesForActivityTypes(makeSupabase(), ['UNLINKED_QUIZ']);

    expect(result.coursesByActivityType?.has('UNLINKED_QUIZ')).toBe(false);
    expect(result.coursesByActivityType?.get('UNLINKED_QUIZ') ?? []).toEqual([]);
    expect(result.quizNameByActivityType?.has('UNLINKED_QUIZ')).toBe(false);
  });

  it('falls back to a placeholder name if the embedded course is missing', async () => {
    queue('assembled_quiz_catalog', {
      data: [{ activity_type: 'CUSTOM_QUIZ', assembled_quiz: { course_id: 'course-1', quiz_name: 'Sprint 1 Quiz', course: null } }],
      error: null,
    });

    const result = await listCoursesForActivityTypes(makeSupabase(), ['CUSTOM_QUIZ']);

    expect(result.coursesByActivityType?.get('CUSTOM_QUIZ')).toEqual([{ courseId: 'course-1', courseName: 'Unknown course' }]);
  });

  it('surfaces a query error', async () => {
    queue('assembled_quiz_catalog', { data: null, error: { message: 'db down' } });

    const result = await listCoursesForActivityTypes(makeSupabase(), ['CUSTOM_QUIZ']);

    expect(result).toEqual({ coursesByActivityType: null, quizNameByActivityType: null, error: { message: 'db down' } });
  });
});
