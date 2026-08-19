import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same harness shape as __tests__/api/instructor-student-history.test.ts, plus .in()/.range()
// since this route's query layer (lib/studentDetailQueries.ts) chunks id-scoped reads through
// fetchAllRowsByIds (lib/supabasePaging.ts).
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      range: () => builder,
      maybeSingle: async () => result,
      single: async () => result,
      then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(result).then(onOk, onErr),
    };
    return builder;
  }

  return { state, makeBuilder };
});

function queue(table: string, result: Result) {
  (h.state.queues[table] ??= []).push(result);
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'instructor-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: [], error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/instructor/students/[studentId]/detail/route';

const STUDENT_ID = 'student-1';
const PARAMS = { params: { studentId: STUDENT_ID } };

function queueCallerRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function queueStudent(exists = true) {
  queue('user', exists ? { data: { user_id: STUDENT_ID, first_name: 'Anne', last_name: 'Lingener', username: 'anne' }, error: null } : { data: null, error: null });
}

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/instructor/students/${STUDENT_ID}/detail`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
});

describe('GET /api/instructor/students/:studentId/detail', () => {
  it('returns 401 without a token', async () => {
    const response = await GET(req(null), PARAMS);
    expect(response.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('rejects a student caller with 403 and an empty body, before touching any data', async () => {
    queueCallerRole('student');

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(h.state.tables).toEqual(['user']);
  });

  it('returns 404 when the target id is not a student', async () => {
    queueCallerRole('instructor');
    queueStudent(false);

    const response = await GET(req(), PARAMS);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 403 with no body when the student shares no course with this instructor', async () => {
    queueCallerRole('instructor');
    queueStudent();
    queue('course', { data: [{ course_id: 'course-owned-by-someone-else' }], error: null }); // listOwnedCourseIds
    queue('student_course', { data: [{ course_id: 'course-a' }], error: null }); // getEnrolledCourseIds

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
  });

  it('never leaks a course belonging only to another instructor into the attempts payload', async () => {
    queueCallerRole('instructor');
    queueStudent();
    // Shared course: course-a. The instructor also owns course-b, which the student is NOT in.
    queue('course', { data: [{ course_id: 'course-a' }, { course_id: 'course-b' }], error: null }); // listOwnedCourseIds
    queue('student_course', { data: [{ course_id: 'course-a' }], error: null }); // getEnrolledCourseIds

    // listActivityTypesForCourses(['course-a'])
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          catalog: { quiz_name: 'Identify Weak User Stories', description: null, grading_kind: 'mcq' },
          assembled_quiz: { course_id: 'course-a', quiz_name: 'Quiz A', description: null, course: { course_name: 'Course A' } },
        },
      ],
      error: null,
    });

    queue('session_log', {
      data: [
        {
          session_id: 'session-1',
          user_id: STUDENT_ID,
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          difficulty_level: 1,
          started_at: '2026-08-01T10:00:00',
          ended_at: '2026-08-01T10:10:00',
          status: 'completed',
          cumulative_score: 80,
          max_score: 100,
          passed: true,
        },
      ],
      error: null,
    });

    // loadProgressForSessions: session_to_question, answered_question_log, session_to_user_story, submission
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });
    queue('session_to_user_story', { data: [], error: null });
    queue('submission', { data: [], error: null });

    // loadQuestionCorrectnessBySession: session_to_question, answered_question_log
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });

    // listCoursesForActivityTypes — the catalog is linked to BOTH course-a (shared) and
    // course-b (owned by this instructor but the student isn't enrolled in it), and could in
    // principle also be linked to a third instructor's course entirely.
    queue('assembled_quiz_catalog', {
      data: [
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', assembled_quiz: { course_id: 'course-a', course: { course_name: 'Course A' } } },
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', assembled_quiz: { course_id: 'course-b', course: { course_name: 'Course B' } } },
      ],
      error: null,
    });

    // loadEnrolledStudentIdsForCourses(['course-a'])
    queue('student_course', { data: [{ user_id: STUDENT_ID }], error: null });

    // class average query
    queue('session_log', { data: [{ cumulative_score: 80, max_score: 100 }], error: null });

    const response = await GET(req(), PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attempts).toHaveLength(1);
    expect(body.attempts[0].courses).toEqual([{ courseId: 'course-a', courseName: 'Course A' }]);
  });

  // GitHub #525: a catalog must be unlinked from every course before it can be deleted, so
  // listActivityTypesForCourses alone would never see it again — this proves the instructor-owned
  // union (listOwnedActivityTypeSummaries) keeps the student's attempt visible anyway.
  it('still shows an attempt on a catalog this instructor owns but has since deleted/unlinked from every course', async () => {
    queueCallerRole('instructor');
    queueStudent();
    queue('course', { data: [{ course_id: 'course-a' }], error: null }); // listOwnedCourseIds
    queue('student_course', { data: [{ course_id: 'course-a' }], error: null }); // getEnrolledCourseIds

    // listActivityTypesForCourses(['course-a']) — nothing currently composed for this course.
    queue('assembled_quiz_catalog', { data: [], error: null });

    // listOwnedActivityTypeSummaries('instructor-1') — the instructor still owns this catalog
    // even though it's no longer linked to (or has been soft-deleted from) any course.
    queue('activity_type', {
      data: [{ activity_type: 'DELETED_CATALOG', quiz_name: 'Deleted Catalog', grading_kind: 'mcq' }],
      error: null,
    });

    queue('session_log', {
      data: [
        {
          session_id: 'session-1',
          user_id: STUDENT_ID,
          activity_type: 'DELETED_CATALOG',
          difficulty_level: 1,
          started_at: '2026-08-01T10:00:00',
          ended_at: '2026-08-01T10:10:00',
          status: 'completed',
          cumulative_score: 40,
          max_score: 40,
          passed: true,
        },
      ],
      error: null,
    });

    // loadProgressForSessions
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });
    queue('session_to_user_story', { data: [], error: null });
    queue('submission', { data: [], error: null });

    // loadQuestionCorrectnessBySession
    queue('session_to_question', { data: [], error: null });
    queue('answered_question_log', { data: [], error: null });

    // listCoursesForActivityTypes(visibleActivityTypes) — the catalog has no course links at all.
    queue('assembled_quiz_catalog', { data: [], error: null });

    // loadEnrolledStudentIdsForCourses(['course-a'])
    queue('student_course', { data: [{ user_id: STUDENT_ID }], error: null });

    // class average query
    queue('session_log', { data: [{ cumulative_score: 40, max_score: 40 }], error: null });

    const response = await GET(req(), PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attempts).toHaveLength(1);
    expect(body.attempts[0].activity_type).toBe('DELETED_CATALOG');
    expect(body.activityNames.DELETED_CATALOG).toBe('Deleted Catalog');
    // No current course link, but the attempt itself still shows.
    expect(body.attempts[0].courses).toEqual([]);
  });

  it('computes the class average from every completed session in the shared courses, scoped to the shared activity types', async () => {
    queueCallerRole('instructor');
    queueStudent();
    queue('course', { data: [{ course_id: 'course-a' }], error: null });
    queue('student_course', { data: [{ course_id: 'course-a' }], error: null });

    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          catalog: { quiz_name: 'Identify Weak User Stories', description: null, grading_kind: 'mcq' },
          assembled_quiz: { course_id: 'course-a', quiz_name: 'Quiz A', description: null, course: { course_name: 'Course A' } },
        },
      ],
      error: null,
    });

    // This student's own attempts: none — sessionIds ends up [], so loadProgressForSessions and
    // loadQuestionCorrectnessBySession both short-circuit without touching supabase at all.
    queue('session_log', { data: [], error: null });

    queue('assembled_quiz_catalog', { data: [], error: null }); // listCoursesForActivityTypes: still called with sharedActivityTypes even with no attempts

    queue('student_course', { data: [{ user_id: STUDENT_ID }, { user_id: 'other-student' }], error: null });

    queue('session_log', {
      data: [
        { cumulative_score: 100, max_score: 100 },
        { cumulative_score: 50, max_score: 100 },
      ],
      error: null,
    });

    const response = await GET(req(), PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.classAveragePercent).toBe(75);
  });

  it('returns an empty result, not an error, when the instructor has no quizzes composed for the shared course yet', async () => {
    queueCallerRole('instructor');
    queueStudent();
    queue('course', { data: [{ course_id: 'course-a' }], error: null });
    queue('student_course', { data: [{ course_id: 'course-a' }], error: null });
    queue('assembled_quiz_catalog', { data: [], error: null }); // listActivityTypesForCourses: nothing composed yet

    const response = await GET(req(), PARAMS);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attempts).toEqual([]);
    expect(body.classAveragePercent).toBeNull();
  });

  it('returns 500 when a query fails', async () => {
    queueCallerRole('instructor');
    queue('user', { data: null, error: { message: 'boom' } });

    const response = await GET(req(), PARAMS);

    expect(response.status).toBe(500);
  });
});
