import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same harness shape as __tests__/api/instructor-activities.test.ts: eq()/in() are recorded
// rather than no-ops, since scoping to this instructor's own llm-graded activity types (and the
// pre-existing student.role/?studentId= filters) are acceptance criteria of this endpoint.
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        state.filters.push({ table, column: `${column} (in)`, value });
        return builder;
      },
      order: () => builder,
      maybeSingle: async () => result,
      then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onOk, onErr),
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
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/instructor/acceptance-criteria/submissions/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

/**
 * listOwnedActivityTypes' query — must be queued before submission in every test that expects
 * submission to actually be reached, since owning zero llm-graded types short-circuits first.
 */
function queueOwnedActivityTypes(types: string[]) {
  queue('activity_type', { data: types.map((activity_type) => ({ activity_type })), error: null });
}

/** listOwnedCourseIds' query — feeds the new shared-course filter. */
function queueOwnedCourseIds(courseIds: string[]) {
  queue('course', { data: courseIds.map((courseId) => ({ course_id: courseId })), error: null });
}

/** loadEnrolledCourseIdsByStudentForCourses' query — who is enrolled in which owned course. */
function queueEnrollments(rows: { userId: string; courseId: string }[]) {
  queue('student_course', { data: rows.map((row) => ({ user_id: row.userId, course_id: row.courseId })), error: null });
}

/**
 * The minimal "this submission's catalog is still reachable via a course the instructor owns and
 * the student is enrolled in" fixture — mirrors __tests__/api/instructor-activities.test.ts's
 * queueSharedCourseAccess for the AC-submission twin of the same shared-course filter.
 */
function queueSharedCourseAccess(options: { courseId?: string; activityType?: string; userId?: string } = {}) {
  const courseId = options.courseId ?? 'course-1';
  const activityType = options.activityType ?? 'MY_LLM_CATALOG';
  const userId = options.userId ?? 'student-1';

  queueOwnedCourseIds([courseId]);
  queue('assembled_quiz_catalog', {
    data: [{ activity_type: activityType, assembled_quiz: { course_id: courseId, course: { course_name: 'Course' } } }],
    error: null,
  });
  queueEnrollments([{ userId, courseId }]);
}

function submissionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    submission_id: 'submission-1',
    session_id: 'session-1',
    submitted_text: 'Given a cart with items, when checkout completes, then the order is created.',
    llm_score: 8,
    llm_feedback: 'Good coverage of the happy path.',
    submitted_at: '2026-08-01T10:00:00.000Z',
    graded_at: '2026-08-01T10:05:00.000Z',
    student: { user_id: 'student-1', first_name: 'Alex', last_name: 'Chen', username: 'achen', role: 'student' },
    story: { story_text: 'As a shopper, I want to check out.', difficulty_level: 1, activity_type: 'MY_LLM_CATALOG' },
    ...overrides,
  };
}

function request(url = 'http://localhost/api/instructor/acceptance-criteria/submissions', token?: string) {
  return new Request(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/instructor/acceptance-criteria/submissions', () => {
  it('answers 401 without a token', async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('answers 401 for an invalid token', async () => {
    const response = await GET(request(undefined, 'bad-token'));
    expect(response.status).toBe(401);
    expect(h.state.tables).not.toContain('submission');
  });

  it('rejects a student with 403 and an empty body, before reading any submission', async () => {
    queueRole('student');

    const response = await GET(request(undefined, 'valid-token'));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('');
    expect(h.state.tables).not.toContain('submission');
  });

  it('maps every field of a submission row, falling back to username when no name is set', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', {
      data: [
        submissionRow(),
        submissionRow({
          submission_id: 'submission-2',
          llm_score: null,
          llm_feedback: null,
          graded_at: null,
          student: { user_id: 'student-2', first_name: null, last_name: null, username: 'quiet-owl', role: 'student' },
        }),
      ],
      error: null,
    });
    queueOwnedCourseIds(['course-1']);
    queue('assembled_quiz_catalog', {
      data: [{ activity_type: 'MY_LLM_CATALOG', assembled_quiz: { course_id: 'course-1', course: { course_name: 'Course' } } }],
      error: null,
    });
    queueEnrollments([
      { userId: 'student-1', courseId: 'course-1' },
      { userId: 'student-2', courseId: 'course-1' },
    ]);

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submissions).toEqual([
      {
        submissionId: 'submission-1',
        sessionId: 'session-1',
        studentId: 'student-1',
        studentName: 'Alex Chen',
        userStoryDescription: 'As a shopper, I want to check out.',
        activityType: 'MY_LLM_CATALOG',
        difficultyLevel: 1,
        submittedText: 'Given a cart with items, when checkout completes, then the order is created.',
        llmScore: 8,
        llmFeedback: 'Good coverage of the happy path.',
        submittedAt: '2026-08-01T10:00:00.000Z',
        gradedAt: '2026-08-01T10:05:00.000Z',
        courses: [{ courseId: 'course-1', courseName: 'Course' }],
        quizName: null,
      },
      {
        submissionId: 'submission-2',
        sessionId: 'session-1',
        studentId: 'student-2',
        studentName: 'quiet-owl',
        userStoryDescription: 'As a shopper, I want to check out.',
        activityType: 'MY_LLM_CATALOG',
        difficultyLevel: 1,
        submittedText: 'Given a cart with items, when checkout completes, then the order is created.',
        llmScore: null,
        llmFeedback: null,
        submittedAt: '2026-08-01T10:00:00.000Z',
        gradedAt: null,
        courses: [{ courseId: 'course-1', courseName: 'Course' }],
        quizName: null,
      },
    ]);
  });

  // GitHub #474: same per-catalog course lookup GET /api/instructor/activities uses for quiz
  // attempts — a submission's own catalog can be linked to a course too.
  it("attaches every course the submission's catalog is linked to", async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [submissionRow()], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'MY_LLM_CATALOG',
          assembled_quiz: { course_id: 'course-1', course: { course_name: 'Requirements 101' } },
        },
      ],
      error: null,
    });
    queueOwnedCourseIds(['course-1']);
    queueEnrollments([{ userId: 'student-1', courseId: 'course-1' }]);

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submissions[0].courses).toEqual([{ courseId: 'course-1', courseName: 'Requirements 101' }]);
  });

  // GitHub #500 follow-up: same assembled_quiz_catalog query as the courses test above — the
  // instructor table's QUIZ column reads this, not the catalog's own quiz_name.
  it("attaches the assembled quiz's own name, not the catalog's", async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [submissionRow()], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'MY_LLM_CATALOG',
          assembled_quiz: { course_id: 'course-1', quiz_name: 'Sprint 3 Acceptance Criteria', course: { course_name: 'Requirements 101' } },
        },
      ],
      error: null,
    });
    queueOwnedCourseIds(['course-1']);
    queueEnrollments([{ userId: 'student-1', courseId: 'course-1' }]);

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submissions[0].quizName).toBe('Sprint 3 Acceptance Criteria');
  });

  // GitHub bug fix: the AC-submission twin of __tests__/api/instructor-activities.test.ts's
  // matching case — a catalog with no live course link at all, the same state a deleted course
  // leaves behind (course deletion cascades away assembled_quiz/assembled_quiz_catalog, but never
  // submission). Used to still surface the orphaned submission with an empty courses list; must
  // now be excluded entirely.
  it('excludes a submission whose catalog is not linked to any course (matches a deleted course)', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [submissionRow()], error: null });
    queue('assembled_quiz_catalog', { data: [], error: null });
    queueOwnedCourseIds(['course-1']);
    queueEnrollments([{ userId: 'student-1', courseId: 'course-1' }]);

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submissions).toEqual([]);
  });

  // The other half: the catalog IS still linked to a course the instructor owns, but this
  // particular student isn't (or is no longer) enrolled in it.
  it('excludes a submission for a student not currently enrolled in the linking course', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [submissionRow()], error: null }); // student-1
    queue('assembled_quiz_catalog', {
      data: [{ activity_type: 'MY_LLM_CATALOG', assembled_quiz: { course_id: 'course-1', course: { course_name: 'Course' } } }],
      error: null,
    });
    queueOwnedCourseIds(['course-1']);
    queueEnrollments([]); // nobody enrolled in course-1

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submissions).toEqual([]);
  });

  it('includes a submission whose catalog is linked to a course the student is currently enrolled in', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [submissionRow()], error: null });
    queueSharedCourseAccess();

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].submissionId).toBe('submission-1');
  });

  it('filters to role student, so an instructor’s own submissions stay out of their report', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [], error: null });

    await GET(request(undefined, 'valid-token'));

    expect(h.state.filters).toContainEqual({ table: 'submission', column: 'student.role', value: 'student' });
  });

  it('applies ?studentId= as an additional filter when present', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [], error: null });

    await GET(request('http://localhost/api/instructor/acceptance-criteria/submissions?studentId=student-1', 'valid-token'));

    expect(h.state.filters).toContainEqual({ table: 'submission', column: 'user_id', value: 'student-1' });
  });

  it('scopes activity_type to this instructor’s own creator_id and llm-graded grading_kind', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes([]);

    await GET(request(undefined, 'valid-token'));

    expect(h.state.filters).toContainEqual({ table: 'activity_type', column: 'creator_id', value: 'instructor-1' });
    expect(h.state.filters).toContainEqual({ table: 'activity_type', column: 'grading_kind', value: 'llm-graded' });
  });

  it('scopes submission to the owned activity types', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG', 'ANOTHER_LLM_CATALOG']);
    queue('submission', { data: [], error: null });

    await GET(request(undefined, 'valid-token'));

    expect(h.state.filters).toContainEqual({
      table: 'submission',
      column: 'story.activity_type (in)',
      value: ['MY_LLM_CATALOG', 'ANOTHER_LLM_CATALOG'],
    });
  });

  it('answers 200 with an empty list, without ever querying submission, when the instructor owns no llm-graded activity types', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes([]);

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ submissions: [] });
    expect(h.state.tables).not.toContain('submission');
  });

  it('answers 200 with an empty list for a class that has not submitted anything', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: [], error: null });

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ submissions: [] });
  });

  it('answers 500 when the owned-activity-type lookup fails, without querying submission', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: { message: 'boom' } });

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
    expect(h.state.tables).not.toContain('submission');
  });

  it('answers 500 when the submission query fails', async () => {
    queueRole('instructor');
    queueOwnedActivityTypes(['MY_LLM_CATALOG']);
    queue('submission', { data: null, error: { message: 'boom' } });

    const response = await GET(request(undefined, 'valid-token'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('boom');
  });
});
