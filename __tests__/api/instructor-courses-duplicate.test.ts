import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
    deletes: [] as { table: string; column: string; value: unknown }[],
  };

  function makeBuilder(table: string, result: Result) {
    let isDelete = false;
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      delete: () => {
        isDelete = true;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        if (isDelete) state.deletes.push({ table, column, value });
        return builder;
      },
      order: () => builder,
      maybeSingle: async () => result,
      single: async () => result,
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

import { POST } from '../../app/api/instructor/courses/[id]/duplicate/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function sourceCourseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    course_id: 'course-1',
    course_name: 'Software Requirements',
    course_code: 'ORIGIN1',
    creator_id: 'instructor-1',
    created_at: '2026-08-11T10:00:00',
    ...overrides,
  };
}

function newCourseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    course_id: 'course-2',
    course_name: 'Software Requirements (Copy)',
    course_code: 'FRESH1',
    creator_id: 'instructor-1',
    created_at: '2026-08-12T10:00:00',
    ...overrides,
  };
}

function postRequest(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/courses/course-1/duplicate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const params = { params: { id: 'course-1' } };

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
  h.state.deletes = [];
});

describe('POST /api/instructor/courses/[id]/duplicate', () => {
  it('returns 401 without a token', async () => {
    const res = await POST(postRequest({ name: 'Copy' }, null), params);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await POST(postRequest({ name: 'Copy' }), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 404 when the source course does not exist', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: null });

    const res = await POST(postRequest({ name: 'Copy' }), params);
    expect(res.status).toBe(404);
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 403 with an empty body when the caller does not own the source course', async () => {
    queueRole('instructor');
    queue('course', { data: sourceCourseRow({ creator_id: 'someone-else' }), error: null });

    const res = await POST(postRequest({ name: 'Copy' }), params);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.inserts).toEqual([]);
  });

  it('returns 400 for a blank name', async () => {
    queueRole('instructor');
    queue('course', { data: sourceCourseRow(), error: null });

    const res = await POST(postRequest({ name: '   ' }), params);
    expect(res.status).toBe(400);
    expect(h.state.inserts).toEqual([]);
  });

  it('creates a copy with a freshly generated code when the source course has no quizzes', async () => {
    queueRole('instructor');
    queue('course', { data: sourceCourseRow(), error: null }); // findOwnedCourse
    queue('course', { data: newCourseRow(), error: null }); // createCourseWithUniqueCode
    queue('assembled_quiz', { data: [], error: null }); // duplicateQuizzesForCourse: nothing to copy

    const res = await POST(postRequest({ name: 'Software Requirements (Copy)' }), params);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.course).toEqual({
      id: 'course-2',
      name: 'Software Requirements (Copy)',
      code: 'FRESH1',
      createdAt: '2026-08-12T10:00:00',
      studentCount: 0,
    });

    const insert = h.state.inserts.find((i) => i.table === 'course');
    expect(insert?.payload).toMatchObject({ creator_id: 'instructor-1', course_name: 'Software Requirements (Copy)' });
    // Uses createCourseWithUniqueCode's own generator — a fresh code, never the source's own.
    const payload = insert?.payload as { course_code: string };
    expect(payload.course_code).toHaveLength(6);
    expect(payload.course_code).not.toBe('ORIGIN1');
  });

  it('retries with a fresh code on a uq_course_code collision, then succeeds', async () => {
    queueRole('instructor');
    queue('course', { data: sourceCourseRow(), error: null }); // findOwnedCourse
    queue('course', { data: null, error: { code: '23505', message: 'duplicate key' } }); // 1st code attempt collides
    queue('course', { data: newCourseRow(), error: null }); // 2nd attempt succeeds
    queue('assembled_quiz', { data: [], error: null });

    const res = await POST(postRequest({ name: 'Copy' }), params);
    expect(res.status).toBe(201);
    expect(h.state.inserts.filter((i) => i.table === 'course')).toHaveLength(2);
  });

  it("copies the source course's quizzes, their linked catalogs, and their question exclusions", async () => {
    queueRole('instructor');
    queue('course', { data: sourceCourseRow(), error: null }); // findOwnedCourse
    queue('course', { data: newCourseRow(), error: null }); // createCourseWithUniqueCode
    queue('assembled_quiz', {
      data: [{ assembled_quiz_id: 'quiz-1', quiz_name: 'Midterm Prep', description: 'desc' }],
      error: null,
    }); // duplicateQuizzesForCourse's source read
    queue('assembled_quiz_catalog', { data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES' }], error: null }); // listQuizCatalogActivityTypes
    queue('quiz_excluded_question', { data: [{ question_id: 'question-1' }], error: null }); // listQuizExcludedQuestionIds
    queue('assembled_quiz', { data: null, error: null }); // createAssembledQuiz's own insert
    queue('assembled_quiz_catalog', { data: null, error: null }); // createAssembledQuiz's link insert
    queue('quiz_excluded_question', { data: null, error: null }); // the exclusion copy insert

    const res = await POST(postRequest({ name: 'Copy' }), params);
    expect(res.status).toBe(201);

    const newQuizInsert = h.state.inserts.find((i) => i.table === 'assembled_quiz');
    expect(newQuizInsert?.payload).toMatchObject({
      quiz_name: 'Midterm Prep',
      description: 'desc',
      course_id: 'course-2',
      creator_id: 'instructor-1',
    });

    const catalogLinkInsert = h.state.inserts.find((i) => i.table === 'assembled_quiz_catalog');
    expect(catalogLinkInsert?.payload).toEqual([{ assembled_quiz_id: expect.any(String), activity_type: 'IDENTIFY_WEAK_USER_STORIES' }]);

    const exclusionInsert = h.state.inserts.find((i) => i.table === 'quiz_excluded_question');
    expect(exclusionInsert?.payload).toEqual([{ assembled_quiz_id: expect.any(String), question_id: 'question-1' }]);
  });

  it('never reads or writes student_course, so the copy starts with 0 enrolled students even though the source course has several', async () => {
    queueRole('instructor');
    queue('course', { data: sourceCourseRow(), error: null });
    queue('course', { data: newCourseRow(), error: null });
    queue('assembled_quiz', { data: [], error: null });
    // No student_course rows are queued at all — if the route touched that table it would either
    // throw (nothing queued) or, per the mock's fallback, silently read { data: null }; either
    // way the assertions below on state.tables/state.inserts catch it.

    const res = await POST(postRequest({ name: 'Copy' }), params);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.course.studentCount).toBe(0);
    expect(h.state.tables).not.toContain('student_course');
    expect(h.state.inserts.find((i) => i.table === 'student_course')).toBeUndefined();
  });

  it('rolls back the new course when copying its quizzes fails', async () => {
    queueRole('instructor');
    queue('course', { data: sourceCourseRow(), error: null }); // findOwnedCourse
    queue('course', { data: newCourseRow(), error: null }); // createCourseWithUniqueCode
    queue('assembled_quiz', { data: null, error: { message: 'DB failure' } }); // duplicateQuizzesForCourse's read fails

    const res = await POST(postRequest({ name: 'Copy' }), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('DB failure');

    // The half-created course is cleaned up rather than left behind — see the route's own
    // docblock on why this isn't transactional.
    expect(h.state.deletes).toEqual([{ table: 'course', column: 'course_id', value: 'course-2' }]);
  });
});
