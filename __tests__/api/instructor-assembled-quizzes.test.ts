import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
    deletes: [] as { table: string; column: string; value: unknown }[],
    filters: [] as { table: string; column: string; value: unknown }[],
    orders: [] as { table: string; column: string; ascending: boolean }[],
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
        if (isDelete) {
          state.deletes.push({ table, column, value });
        } else {
          state.filters.push({ table, column, value });
        }
        return builder;
      },
      in: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        state.orders.push({ table, column, ascending: opts?.ascending ?? true });
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

import { GET, POST } from '../../app/api/instructor/assembled-quizzes/route';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function courseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    course_id: 'course-1',
    course_name: 'Software Requirements',
    course_code: 'ABCDEF',
    creator_id: 'instructor-1',
    created_at: '2026-08-11T10:00:00',
    ...overrides,
  };
}

function queueOwnedCourse(overrides: Partial<Record<string, unknown>> = {}) {
  queue('course', { data: courseRow(overrides), error: null });
}

function queueValidCatalogs(activityTypes: string[], gradingKind: string = 'mcq') {
  queue('activity_type', { data: activityTypes.map((activity_type) => ({ activity_type, grading_kind: gradingKind })), error: null });
}

function getRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/assembled-quizzes', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function postRequest(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/assembled-quizzes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Sprint 1 Requirements Check',
    description: 'Covers weak stories and weak criteria.',
    courseId: 'course-1',
    gradingKind: 'mcq',
    catalogActivityTypes: ['IDENTIFY_WEAK_USER_STORIES', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'],
    ...overrides,
  };
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
  h.state.deletes = [];
  h.state.filters = [];
  h.state.orders = [];
});

describe('GET /api/instructor/assembled-quizzes', () => {
  it('returns 401 without a token', async () => {
    const res = await GET(getRequest(null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('assembled_quiz');
  });

  it('returns 200 with the mapped quiz list, scoped to the caller', async () => {
    queueRole('instructor');
    queue('assembled_quiz', {
      data: [
        {
          assembled_quiz_id: 'quiz-1',
          quiz_name: 'Sprint 1 Requirements Check',
          description: 'Covers weak stories and weak criteria.',
          course_id: 'course-1',
          grading_kind: 'mcq',
          created_at: '2026-08-14T10:00:00',
          course: { course_name: 'Software Requirements' },
          assembled_quiz_catalog: [
            { activity_type: 'IDENTIFY_WEAK_USER_STORIES', catalog: { quiz_name: 'Identify Weak User Stories', grading_kind: 'mcq' } },
            { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', catalog: { quiz_name: 'Identify Weak Acceptance Criteria', grading_kind: 'mcq' } },
          ],
        },
      ],
      error: null,
    });

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.quizzes).toEqual([
      {
        id: 'quiz-1',
        name: 'Sprint 1 Requirements Check',
        description: 'Covers weak stories and weak criteria.',
        courseId: 'course-1',
        courseName: 'Software Requirements',
        gradingKind: 'mcq',
        catalogs: [
          { activityType: 'IDENTIFY_WEAK_USER_STORIES', name: 'Identify Weak User Stories', gradingKind: 'mcq' },
          { activityType: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', name: 'Identify Weak Acceptance Criteria', gradingKind: 'mcq' },
        ],
        catalogNames: ['Identify Weak User Stories', 'Identify Weak Acceptance Criteria'],
        createdAt: '2026-08-14T10:00:00',
      },
    ]);

    expect(h.state.filters).toContainEqual({ table: 'assembled_quiz', column: 'creator_id', value: 'instructor-1' });
  });

  it('returns 200 with an empty list when the instructor has created no quizzes', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: [], error: null });

    const res = await GET(getRequest());
    const body = await res.json();
    expect(body.quizzes).toEqual([]);
  });

  it('returns 500 when the query fails', async () => {
    queueRole('instructor');
    queue('assembled_quiz', { data: null, error: { message: 'DB down' } });

    const res = await GET(getRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});

describe('POST /api/instructor/assembled-quizzes', () => {
  it('returns 401 without a token', async () => {
    const res = await POST(postRequest(validBody(), null));
    expect(res.status).toBe(401);
    expect(h.state.tables).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.tables).not.toContain('course');
  });

  it('returns 400 for invalid JSON', async () => {
    queueRole('instructor');
    const res = await POST(
      new Request('http://localhost/api/instructor/assembled-quizzes', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        body: '{not json',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('rejects a blank name with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ name: '   ' })));
    expect(res.status).toBe(400);
  });

  it('rejects a missing courseId with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ courseId: undefined })));
    expect(res.status).toBe(400);
  });

  it('rejects an empty catalogActivityTypes array with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ catalogActivityTypes: [] })));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('At least one catalog must be selected.');
  });

  it('rejects a non-array catalogActivityTypes with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ catalogActivityTypes: 'IDENTIFY_WEAK_USER_STORIES' })));
    expect(res.status).toBe(400);
  });

  it('rejects non-string entries in catalogActivityTypes with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ catalogActivityTypes: ['IDENTIFY_WEAK_USER_STORIES', 42] })));
    expect(res.status).toBe(400);
  });

  it('rejects a missing gradingKind with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ gradingKind: undefined })));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('gradingKind must be "mcq" or "llm-graded".');
    expect(h.state.tables).not.toContain('course');
  });

  it('rejects an invalid gradingKind with 400', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ gradingKind: 'essay' })));
    expect(res.status).toBe(400);
  });

  // The rubric belongs to the quiz (assembled_quiz.rating_prompt), not any catalog it composes —
  // required, with no default, only when the quiz's own gradingKind is 'llm-graded'.
  it('returns 400 when ratingPrompt is missing for an llm-graded quiz, without touching assembled_quiz', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ gradingKind: 'llm-graded' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ratingPrompt/);
    expect(h.state.tables).not.toContain('assembled_quiz');
  });

  it('returns 400 when ratingPrompt is blank/whitespace-only for an llm-graded quiz', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ gradingKind: 'llm-graded', ratingPrompt: '   ' })));
    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('assembled_quiz');
  });

  it('returns 400 when ratingPrompt exceeds the shared length cap', async () => {
    queueRole('instructor');
    const res = await POST(postRequest(validBody({ gradingKind: 'llm-graded', ratingPrompt: 'x'.repeat(4001) })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/4000/);
  });

  it('does not require ratingPrompt for an mcq quiz, and stores null', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queueValidCatalogs(['IDENTIFY_WEAK_USER_STORIES', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA']);
    queue('assembled_quiz', { data: null, error: null });
    queue('assembled_quiz_catalog', { data: null, error: null });

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(201);

    const quizInsert = h.state.inserts.find((i) => i.table === 'assembled_quiz');
    expect(quizInsert?.payload).toMatchObject({ rating_prompt: null });
  });

  it('stores and returns a trimmed ratingPrompt for an llm-graded quiz', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queueValidCatalogs(['IDENTIFY_WEAK_USER_STORIES', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA'], 'llm-graded');
    queue('assembled_quiz', { data: null, error: null });
    queue('assembled_quiz_catalog', { data: null, error: null });

    const res = await POST(
      postRequest(validBody({ gradingKind: 'llm-graded', ratingPrompt: '  Score strictness: high.  ' })),
    );
    expect(res.status).toBe(201);

    const quizInsert = h.state.inserts.find((i) => i.table === 'assembled_quiz');
    expect(quizInsert?.payload).toMatchObject({ rating_prompt: 'Score strictness: high.' });

    const body = await res.json();
    expect(body.quiz.ratingPrompt).toBe('Score strictness: high.');
  });

  it('returns 400 when a selected catalog\'s grading_kind does not match the submitted gradingKind', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    // Both catalogs exist, but one is llm-graded while the quiz is being created as 'mcq'.
    queue('activity_type', {
      data: [
        { activity_type: 'IDENTIFY_WEAK_USER_STORIES', grading_kind: 'mcq' },
        { activity_type: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', grading_kind: 'llm-graded' },
      ],
      error: null,
    });

    const res = await POST(postRequest(validBody()));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("All selected catalogs must match the quiz's activity type.");
    expect(h.state.tables).not.toContain('assembled_quiz');
  });

  it('returns 404 when the course does not exist', async () => {
    queueRole('instructor');
    queue('course', { data: null, error: null });

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Course not found.');
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('returns 403 with an empty body when the caller does not own the course', async () => {
    queueRole('instructor');
    queueOwnedCourse({ creator_id: 'some-other-instructor' });

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 400 when a catalog does not exist', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queueValidCatalogs(['IDENTIFY_WEAK_USER_STORIES']); // only one of the two requested exists

    const res = await POST(postRequest(validBody()));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('One or more catalogs do not exist.');
    expect(h.state.tables).not.toContain('assembled_quiz');
  });

  it('creates the quiz and links every selected catalog, deduplicating repeated ids', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queueValidCatalogs(['IDENTIFY_WEAK_USER_STORIES', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA']);
    queue('assembled_quiz', { data: null, error: null }); // quiz insert
    queue('assembled_quiz_catalog', { data: null, error: null }); // link inserts

    const res = await POST(
      postRequest(
        validBody({
          catalogActivityTypes: ['IDENTIFY_WEAK_USER_STORIES', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', 'IDENTIFY_WEAK_USER_STORIES'],
        }),
      ),
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.quiz).toMatchObject({
      name: 'Sprint 1 Requirements Check',
      description: 'Covers weak stories and weak criteria.',
      courseId: 'course-1',
    });
    expect(typeof body.quiz.id).toBe('string');

    const quizInsert = h.state.inserts.find((i) => i.table === 'assembled_quiz');
    expect(quizInsert?.payload).toMatchObject({
      quiz_name: 'Sprint 1 Requirements Check',
      description: 'Covers weak stories and weak criteria.',
      course_id: 'course-1',
      creator_id: 'instructor-1',
    });

    const linkInsert = h.state.inserts.find((i) => i.table === 'assembled_quiz_catalog');
    // Deduplicated: the repeated IDENTIFY_WEAK_USER_STORIES only produces one link row.
    expect(linkInsert?.payload as unknown[]).toHaveLength(2);
  });

  it('creates the quiz with a null description when none is provided', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queueValidCatalogs(['IDENTIFY_WEAK_USER_STORIES']);
    queue('assembled_quiz', { data: null, error: null });
    queue('assembled_quiz_catalog', { data: null, error: null });

    await POST(postRequest(validBody({ description: undefined, catalogActivityTypes: ['IDENTIFY_WEAK_USER_STORIES'] })));

    const quizInsert = h.state.inserts.find((i) => i.table === 'assembled_quiz');
    expect((quizInsert?.payload as { description: unknown }).description).toBeNull();
  });

  it('deletes the quiz row it just inserted when the catalog link insert fails', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queueValidCatalogs(['IDENTIFY_WEAK_USER_STORIES', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA']);
    queue('assembled_quiz', { data: null, error: null }); // quiz insert succeeds
    queue('assembled_quiz_catalog', { data: null, error: { message: 'link insert failed' } }); // links fail

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('link insert failed');

    const quizId = (h.state.inserts.find((i) => i.table === 'assembled_quiz')?.payload as { assembled_quiz_id: string })
      .assembled_quiz_id;
    expect(h.state.deletes).toContainEqual({ table: 'assembled_quiz', column: 'assembled_quiz_id', value: quizId });
  });

  it('returns 500 when the quiz insert itself fails', async () => {
    queueRole('instructor');
    queueOwnedCourse();
    queueValidCatalogs(['IDENTIFY_WEAK_USER_STORIES', 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA']);
    queue('assembled_quiz', { data: null, error: { message: 'quiz insert failed' } });

    const res = await POST(postRequest(validBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('quiz insert failed');
    expect(h.state.tables).not.toContain('assembled_quiz_catalog');
  });
});
