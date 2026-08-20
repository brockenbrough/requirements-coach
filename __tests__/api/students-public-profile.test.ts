import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Harness copied from __tests__/api/score.test.ts, extended with `in`/`limit`/`maybeSingle`
// (same additions __tests__/api/courses-leaderboard.test.ts already needed) since this route
// composes a "user" lookup, one student_course read (via lib/courseQueries.ts's
// getEnrolledCourseIds, for the target's own courses) and computeStudentScore/computeStudentTitles.
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
      limit: () => builder,
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
          ? { data: { user: { id: 'caller-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
    },
    from: (table: string) => {
      h.state.tables.push(table);
      const result = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, result);
    },
  }),
}));

import { GET } from '../../app/api/students/[studentId]/public-profile/route';

const TARGET_ID = 'target-1';

function req(token: string | null = 'valid-token') {
  return new Request(`http://localhost/api/students/${TARGET_ID}/public-profile`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const ctx = { params: { studentId: TARGET_ID } };

function targetRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    username: 'ada',
    avatar_url: null,
    biography: 'Hello!',
    role: 'student',
    // The fk_user_title_definition embed: null when this student wears no title.
    selected_title: null,
    ...overrides,
  };
}

/** Queues the full happy-path chain: target row, target's courses, score, titles, ladder. */
function queueHappyPath(options: { targetCourseIds?: string[] } = {}) {
  queue('user', { data: targetRow(), error: null });
  queue('student_course', { data: (options.targetCourseIds ?? ['course-1']).map((id) => ({ course_id: id })), error: null });
  queue('session_log', {
    data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, cumulative_score: 100, status: 'completed', passed: true }],
    error: null,
  });
  queue('session_log', {
    data: [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, passed: true }],
    error: null,
  });
  queue('title_definition', {
    data: [
      {
        title_definition_id: 'title-1',
        activity_type: 'IDENTIFY_WEAK_USER_STORIES',
        difficulty_level: 1,
        title_name: 'Requirements Novice',
      },
    ],
    error: null,
  });
  // availableTitles: the target's own course-scoped activity list, plus its full ladder.
  queue('assembled_quiz_catalog', {
    data: [
      {
        activity_type: 'IDENTIFY_WEAK_USER_STORIES',
        catalog: { quiz_name: 'Identify Weak User Stories', description: null },
        assembled_quiz: { course_id: 'course-1', course: { course_name: 'Course 1' } },
      },
    ],
    error: null,
  });
  queue('title_definition', {
    data: [
      {
        title_definition_id: 'title-1',
        activity_type: 'IDENTIFY_WEAK_USER_STORIES',
        difficulty_level: 1,
        title_name: 'Requirements Novice',
      },
    ],
    error: null,
  });
}

describe('GET /api/students/{studentId}/public-profile', () => {
  beforeEach(() => {
    h.state.queues = {};
    h.state.tables = [];
    h.state.filters = [];
  });

  it('returns 401 without a token, before touching any table', async () => {
    const response = await GET(req(null), ctx);
    expect(response.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('bad-token'), ctx);
    expect(response.status).toBe(401);
  });

  // AC: 404 for an unknown id.
  it('returns 404 for an unknown student, without checking courses', async () => {
    queue('user', { data: null, error: null });

    const response = await GET(req(), ctx);

    expect(response.status).toBe(404);
    expect(h.state.tables).not.toContain('student_course');
  });

  // AC: 403 for a non-student target — an instructor has no public profile.
  it('returns 403 for an instructor target, without checking courses', async () => {
    queue('user', { data: targetRow({ role: 'instructor' }), error: null });

    const response = await GET(req(), ctx);

    expect(response.status).toBe(403);
    expect(h.state.tables).not.toContain('student_course');
  });

  it('returns the profile when caller and target share a course', async () => {
    queueHappyPath();

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      username: 'ada',
      avatarUrl: null,
      biography: 'Hello!',
      selectedTitle: null,
      score: 100,
      titles: [{ activityType: 'IDENTIFY_WEAK_USER_STORIES', difficultyLevel: 1, title: 'Requirements Novice' }],
      availableTitles: [
        {
          activityType: 'IDENTIFY_WEAK_USER_STORIES',
          activityName: 'Identify Weak User Stories',
          courseId: 'course-1',
          courseName: 'Course 1',
          titles: [
            { difficultyLevel: 1, titleDefinitionId: 'title-1', title: 'Requirements Novice' },
            { difficultyLevel: 2, titleDefinitionId: null, title: null },
            { difficultyLevel: 3, titleDefinitionId: null, title: null },
          ],
        },
      ],
    });
  });

  // Bug fix: this route used to 403 unless the caller and target shared a course
  // (isEnrolledInAnyCourse), which broke clicking a student's row on the global ("All")
  // leaderboard — a leaderboard that deliberately shows every student to every other student
  // (see computeGlobalLeaderboard in lib/leaderboardQueries.ts). Authorization is role-only now,
  // so this succeeds regardless of the caller's own enrollments; the mock harness never queues or
  // reads the caller's student_course rows at all, which is itself part of what this test proves.
  it('returns the profile for a caller who shares no course with the target', async () => {
    queueHappyPath();

    const response = await GET(req(), ctx);

    expect(response.status).toBe(200);
    expect(h.state.filters.filter((f) => f.column === 'user_id' && f.value === 'caller-1')).toEqual([]);
  });

  // AC: the response body must contain none of these fields, even though "user" itself has them.
  it('never includes first_name, last_name, age, semester or role in the response', async () => {
    queueHappyPath();

    const response = await GET(req(), ctx);
    const body = await response.json();

    expect(body).not.toHaveProperty('first_name');
    expect(body).not.toHaveProperty('last_name');
    expect(body).not.toHaveProperty('age');
    expect(body).not.toHaveProperty('semester');
    expect(body).not.toHaveProperty('role');
    expect(body).not.toHaveProperty('studentId');
  });

  it('selects only username, avatar_url, biography and role from "user"', async () => {
    queueHappyPath();

    await GET(req(), ctx);

    expect(h.state.filters).toContainEqual({ table: 'user', column: 'user_id', value: TARGET_ID });
  });

  it("checks the target's own courses via student_course", async () => {
    queueHappyPath({ targetCourseIds: ['course-1', 'course-2'] });

    await GET(req(), ctx);

    const studentCourseFilters = h.state.filters.filter((f) => f.table === 'student_course');
    expect(studentCourseFilters).toEqual([{ table: 'student_course', column: 'user_id', value: TARGET_ID }]);
  });

  it('returns 500 when the target lookup fails', async () => {
    queue('user', { data: null, error: { message: 'db down' } });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });

  it("returns 500 when reading the target's courses fails", async () => {
    queue('user', { data: targetRow(), error: null });
    queue('student_course', { data: null, error: { message: 'db down' } });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });

  it('returns 500 when computing the score or titles fails', async () => {
    queue('user', { data: targetRow(), error: null });
    queue('student_course', { data: [{ course_id: 'course-1' }], error: null });
    queue('session_log', { data: null, error: { message: 'db down' } });
    queue('session_log', { data: [], error: null });
    queue('title_definition', { data: [], error: null });

    const response = await GET(req(), ctx);
    expect(response.status).toBe(500);
  });
});
