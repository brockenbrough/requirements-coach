import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkActivityAccess,
  getCourseForActivityType,
  linkActivityTypeToCourse,
  listActivityTypesForCourses,
} from '../../lib/activityCourseQueries';

type Result = { data?: unknown; error?: unknown };

// Same fake-client shape as __tests__/lib/instructorAuth.test.ts — these functions take
// `supabase` as a plain argument, so a locally built fake is enough (no vi.mock needed).
const state = {
  queues: {} as Record<string, Result[]>,
  tables: [] as string[],
  filters: [] as { table: string; column: string; value: unknown }[],
  inserts: [] as { table: string; row: unknown }[],
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
    insert: (row: unknown) => {
      state.inserts.push({ table, row });
      return builder;
    },
    maybeSingle: async () => result,
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
  state.inserts = [];
});

describe('linkActivityTypeToCourse', () => {
  it('inserts a link row and returns no error', async () => {
    queue('activity_type_course', { error: null });

    const result = await linkActivityTypeToCourse(makeSupabase(), { activityType: 'CUSTOM_QUIZ', courseId: 'course-1' });

    expect(result.error).toBeNull();
    expect(state.inserts).toEqual([{ table: 'activity_type_course', row: { activity_type: 'CUSTOM_QUIZ', course_id: 'course-1' } }]);
  });

  it('surfaces a 23505 (already linked) as-is', async () => {
    queue('activity_type_course', { error: { code: '23505', message: 'duplicate' } });

    const result = await linkActivityTypeToCourse(makeSupabase(), { activityType: 'CUSTOM_QUIZ', courseId: 'course-1' });

    expect((result.error as { code: string }).code).toBe('23505');
  });
});

describe('getCourseForActivityType', () => {
  it('returns null when the activity has no course link', async () => {
    queue('activity_type_course', { data: null, error: null });

    const result = await getCourseForActivityType(makeSupabase(), 'UNLINKED');

    expect(result).toEqual({ link: null, error: null });
  });

  it('returns the linked course id and name', async () => {
    queue('activity_type_course', { data: { course_id: 'course-1', course: { course_name: 'Intro to SE' } }, error: null });

    const result = await getCourseForActivityType(makeSupabase(), 'LINKED');

    expect(result).toEqual({ link: { courseId: 'course-1', courseName: 'Intro to SE' }, error: null });
  });

  it('falls back to a placeholder name if the embedded course is missing', async () => {
    queue('activity_type_course', { data: { course_id: 'course-1', course: null }, error: null });

    const result = await getCourseForActivityType(makeSupabase(), 'LINKED');

    expect(result.link).toEqual({ courseId: 'course-1', courseName: 'Unknown course' });
  });
});

describe('checkActivityAccess', () => {
  it('is forbidden when the activity has no course link at all', async () => {
    queue('activity_type_course', { data: null, error: null });

    const result = await checkActivityAccess(makeSupabase(), 'UNLINKED', 'student-1');

    expect(result).toEqual({ status: 'forbidden' });
  });

  it('is forbidden when the caller is not enrolled in the linked course', async () => {
    queue('activity_type_course', { data: { course_id: 'course-1', course: { course_name: 'Intro to SE' } }, error: null });
    queue('student_course', { data: [], error: null });

    const result = await checkActivityAccess(makeSupabase(), 'LINKED', 'student-1');

    expect(result).toEqual({ status: 'forbidden' });
  });

  it('is ok when the caller is enrolled in the linked course', async () => {
    queue('activity_type_course', { data: { course_id: 'course-1', course: { course_name: 'Intro to SE' } }, error: null });
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });

    const result = await checkActivityAccess(makeSupabase(), 'LINKED', 'student-1');

    expect(result).toEqual({ status: 'ok' });
  });

  it('surfaces a link-lookup error', async () => {
    queue('activity_type_course', { data: null, error: { message: 'db down' } });

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

  it('maps every linked activity with its catalog and course info', async () => {
    queue('activity_type_course', {
      data: [
        {
          activity_type: 'CUSTOM_QUIZ',
          course_id: 'course-1',
          course: { course_name: 'Intro to SE' },
          catalog: { quiz_name: 'Sprint 1 Check', description: 'Covers sprint basics', grading_kind: 'mcq' },
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
  });

  // The field the student play flow branches on, so it has to survive this mapping intact.
  it('carries an llm-graded catalog kind through', async () => {
    queue('activity_type_course', {
      data: [
        {
          activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
          course_id: 'course-1',
          course: { course_name: 'Intro to SE' },
          catalog: { quiz_name: 'Write Acceptance Criteria', description: null, grading_kind: 'llm-graded' },
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
    queue('activity_type_course', {
      data: [
        {
          activity_type: 'ORPHANED',
          course_id: 'course-1',
          course: { course_name: 'Intro to SE' },
          catalog: null,
        },
        {
          activity_type: 'WEIRD',
          course_id: 'course-1',
          course: { course_name: 'Intro to SE' },
          catalog: { quiz_name: 'Weird', description: null, grading_kind: 'peer-reviewed' },
        },
      ],
      error: null,
    });

    const result = await listActivityTypesForCourses(makeSupabase(), ['course-1']);

    expect(result.activities?.map((a) => a.gradingKind)).toEqual(['mcq', 'mcq']);
  });
});
