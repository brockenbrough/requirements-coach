import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Harness copied from __tests__/api/activities-list.test.ts, since this route composes the same
// getEnrolledCourseIds + listActivityTypesForCourses pair plus one more title_definition read.
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
        state.filters.push({ table, column, value });
        return builder;
      },
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
          ? { data: { user: { id: 'student-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/students/[studentId]/available-titles/route';

const STUDENT_ID = 'student-1';

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/students/${STUDENT_ID}/available-titles`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const ctx = { params: { studentId: STUDENT_ID } };

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
});

describe('GET /api/students/{studentId}/available-titles', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(req(null), ctx);
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await GET(req('bad-token'), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a studentId that is not the requesting student's", async () => {
    const res = await GET(req(), { params: { studentId: 'someone-else' } });

    expect(res.status).toBe(403);
    expect(h.state.tables).toEqual([]);
  });

  it('returns an empty list without querying assembled_quiz_catalog when enrolled in no course', async () => {
    queue('student_course', { data: [], error: null });

    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activities).toEqual([]);
    expect(h.state.tables).not.toContain('assembled_quiz_catalog');
  });

  it('returns every linked activity with its full title ladder, including a null title for a missing level', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          catalog: { quiz_name: 'Identify Weak User Stories', description: null },
          assembled_quiz: { course_id: 'course-1', course: { course_name: 'Software Requirements' } },
        },
      ],
      error: null,
    });
    // Only levels 1 and 2 have a title_definition row — level 3 has none yet.
    queue('title_definition', {
      data: [
        { title_definition_id: 'title-1', activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, title_name: 'Story Apprentice' },
        { title_definition_id: 'title-2', activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 2, title_name: 'Story Analyst' },
      ],
      error: null,
    });

    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.activities).toEqual([
      {
        activityType: 'IDENTIFY_WEAK_USER_STORIES',
        activityName: 'Identify Weak User Stories',
        courseId: 'course-1',
        courseName: 'Software Requirements',
        // titleDefinitionId travels with each rung so the profile page's title dropdown can store
        // the student's pick by id; it is null exactly where the title is.
        titles: [
          { difficultyLevel: 1, titleDefinitionId: 'title-1', title: 'Story Apprentice' },
          { difficultyLevel: 2, titleDefinitionId: 'title-2', title: 'Story Analyst' },
          { difficultyLevel: 3, titleDefinitionId: null, title: null },
        ],
      },
    ]);

    expect(h.state.filters).toContainEqual({
      table: 'title_definition',
      column: 'activity_type',
      value: ['IDENTIFY_WEAK_USER_STORIES'],
    });
  });

  it('returns 500 when the enrolled-course lookup fails', async () => {
    queue('student_course', { data: null, error: { message: 'DB down' } });

    const res = await GET(req(), ctx);
    expect(res.status).toBe(500);
  });

  it('returns 500 when the activity lookup fails', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', { data: null, error: { message: 'DB down' } });

    const res = await GET(req(), ctx);
    expect(res.status).toBe(500);
  });

  it('returns 500 when the title_definition lookup fails', async () => {
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('assembled_quiz_catalog', {
      data: [
        {
          activity_type: 'IDENTIFY_WEAK_USER_STORIES',
          catalog: { quiz_name: 'Identify Weak User Stories', description: null },
          assembled_quiz: { course_id: 'course-1', course: { course_name: 'Software Requirements' } },
        },
      ],
      error: null,
    });
    queue('title_definition', { data: null, error: { message: 'DB down' } });

    const res = await GET(req(), ctx);
    expect(res.status).toBe(500);
  });
});
