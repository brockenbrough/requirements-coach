import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
    // Title authoring writes through an upsert, and a failed ladder insert rolls the catalog back
    // with a delete — neither existed on this builder before.
    upserts: [] as { table: string; payload: unknown }[],
    deletes: [] as { table: string; filters: { column: string; value: unknown }[] }[],
    user: { id: 'instructor-1' } as { id: string } | null,
  };

  function makeBuilder(table: string, result: Result) {
    const filters: { column: string; value: unknown }[] = [];

    const builder: Record<string, unknown> = {
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      upsert: (payload: unknown) => {
        state.upserts.push({ table, payload });
        return builder;
      },
      delete: () => {
        state.deletes.push({ table, filters });
        return builder;
      },
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        filters.push({ column, value });
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
    from: (table: string) => {
      h.state.tables.push(table);
      const queued = h.state.queues[table]?.shift() ?? { data: null, error: null };
      return h.makeBuilder(table, queued);
    },
    auth: {
      getUser: async () => ({
        data: { user: h.state.user },
        error: null,
      }),
    },
  }),
}));

import { POST } from '../../app/api/activities/types/route';

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/activities/types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

/** activity_type as the insert's .select(...).maybeSingle() returns it. */
function activityTypeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: 'MY_CUSTOM_QUIZ',
    quiz_name: 'My Custom Quiz',
    description: null,
    grading_kind: 'mcq',
    ...overrides,
  };
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return { name: 'My Custom Quiz', gradingKind: 'mcq', ...overrides };
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
  h.state.upserts = [];
  h.state.deletes = [];
  h.state.user = { id: 'instructor-1' };
});

describe('POST /api/activities/types', () => {
  it('returns 401 when no token is provided', async () => {
    h.state.user = null;
    const req = new Request('http://localhost/api/activities/types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody()),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is not an instructor', async () => {
    queueRole('student');
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/name/i);
  });

  it('returns 400 when name is blank', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest(validBody({ name: '   ' })));
    expect(res.status).toBe(400);
  });

  // GitHub #379, AC #1: "creation cannot proceed without this choice". Enforcing it only in the
  // create modal would leave the route defaulting to the column's 'mcq', and the kind can't be
  // changed afterwards — so a silent default produces a wrong catalog, not a fixable one.
  it('returns 400 when gradingKind is missing, without touching activity_type', async () => {
    queueRole('instructor');

    const { gradingKind: _omitted, ...withoutKind } = validBody();
    const res = await POST(makeRequest(withoutKind));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/gradingKind/);
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('returns 400 for a gradingKind outside the CHECK constraint', async () => {
    for (const gradingKind of ['MCQ', 'llm', 'peer-reviewed', '', 1, null]) {
      queueRole('instructor');
      const res = await POST(makeRequest(validBody({ gradingKind })));
      expect(res.status).toBe(400);
      h.state.tables = [];
    }
  });

  it('stores llm-graded when that kind is chosen, and reports it back', async () => {
    queueRole('instructor');
    queue('activity_type', { data: activityTypeRow({ grading_kind: 'llm-graded' }), error: null });

    const res = await POST(makeRequest(validBody({ gradingKind: 'llm-graded' })));
    expect(res.status).toBe(201);

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect(insert?.payload).toMatchObject({ grading_kind: 'llm-graded' });

    const body = await res.json();
    expect(body.quiz.gradingKind).toBe('llm-graded');
  });

  it('returns 400 when name has no letters or numbers to derive a key from', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest(validBody({ name: '!!! ---' })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/letter or number/i);
  });

  it('returns 400 when the derived key would exceed 50 characters', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest(validBody({ name: 'A'.repeat(51) })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too long/i);
  });

  it('returns 400 when description is not a string', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest(validBody({ description: 123 })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description/i);
  });

  it('derives the key by upper-casing and collapsing non-alphanumeric runs, matching the built-in keys\' own format', async () => {
    queueRole('instructor');
    queue('activity_type', { data: activityTypeRow({ activity_type: 'IDENTIFY_WEAK_USER_STORIES', quiz_name: 'Identify Weak User Stories' }), error: null });

    await POST(makeRequest(validBody({ name: 'Identify Weak User Stories' })));

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect((insert?.payload as { activity_type: string }).activity_type).toBe('IDENTIFY_WEAK_USER_STORIES');
  });

  it('creates the catalog and returns the derived key, name, and description — no course fields', async () => {
    queueRole('instructor');
    queue('activity_type', { data: activityTypeRow({ description: 'A quiz about things' }), error: null });

    const res = await POST(makeRequest(validBody({ description: 'A quiz about things' })));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.quiz).toEqual({
      titles: [],
      activityType: 'MY_CUSTOM_QUIZ',
      name: 'My Custom Quiz',
      description: 'A quiz about things',
      gradingKind: 'mcq',
    });
  });

  it('trims name, and an empty/whitespace-only description is stored as null rather than an empty string', async () => {
    queueRole('instructor');
    queue('activity_type', { data: activityTypeRow(), error: null });

    await POST(makeRequest(validBody({ name: '  My Custom Quiz  ', description: '   ' })));

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect(insert?.payload).toMatchObject({ quiz_name: 'My Custom Quiz', description: null });
  });

  it('sets creator_id from the authenticated instructor, not the request body', async () => {
    queueRole('instructor');
    queue('activity_type', { data: activityTypeRow(), error: null });

    await POST(makeRequest(validBody()));

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect((insert?.payload as { creator_id: string }).creator_id).toBe('instructor-1');
  });

  // The whole point of GitHub #347's "report, don't auto-suffix": the instructor picks a
  // different name themselves, so there must be exactly one insert attempt, not a retry loop.
  it('returns 409 on a name collision, without retrying with a suffixed key', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: { code: '23505', message: 'duplicate key' } });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
    expect(h.state.inserts.filter((i) => i.table === 'activity_type')).toHaveLength(1);
  });

  it('returns 500 when the database returns a non-collision error', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: { code: '99999', message: 'DB error' } });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });
});

// Mastery title authoring at creation time. Titles are optional throughout: every catalog created
// before this feature existed has none, and requiring them would put a barrier in front of catalog
// creation itself.
describe('POST /api/activities/types — mastery titles', () => {
  it('writes the ladder alongside the catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: activityTypeRow(), error: null });
    queue('title_definition', { data: null, error: null });

    const res = await POST(
      makeRequest(
        validBody({
          titles: [
            { difficultyLevel: 1, titleName: 'Story Apprentice' },
            { difficultyLevel: 2, titleName: 'Story Analyst' },
          ],
        }),
      ),
    );

    expect(res.status).toBe(201);
    const upsert = h.state.upserts.find((entry) => entry.table === 'title_definition');
    expect(upsert?.payload).toEqual([
      expect.objectContaining({ activity_type: 'MY_CUSTOM_QUIZ', difficulty_level: 1, title_name: 'Story Apprentice' }),
      expect.objectContaining({ activity_type: 'MY_CUSTOM_QUIZ', difficulty_level: 2, title_name: 'Story Analyst' }),
    ]);
  });

  it('creates the catalog without touching title_definition when no titles are given', async () => {
    queueRole('instructor');
    queue('activity_type', { data: activityTypeRow(), error: null });

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(201);
    expect(h.state.tables).not.toContain('title_definition');
  });

  it('treats an empty ladder the same as none', async () => {
    queueRole('instructor');
    queue('activity_type', { data: activityTypeRow(), error: null });

    const res = await POST(
      makeRequest(
        validBody({
          titles: [
            { difficultyLevel: 1, titleName: '' },
            { difficultyLevel: 2, titleName: '   ' },
          ],
        }),
      ),
    );

    expect(res.status).toBe(201);
    // Only clears were requested and there is nothing to clear on a catalog created a moment ago,
    // so the ladder write is a no-op rather than a delete.
    expect(h.state.upserts).toHaveLength(0);
  });

  // Rollback by hand — there is no transaction. Leaving the catalog behind would be worse than
  // failing outright: the instructor would retry the same name and hit the 409 collision instead.
  it('deletes the just-created catalog when the ladder insert fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: activityTypeRow(), error: null });
    queue('title_definition', { data: null, error: { message: 'ladder exploded' } });

    const res = await POST(
      makeRequest(validBody({ titles: [{ difficultyLevel: 1, titleName: 'Story Apprentice' }] })),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'ladder exploded' });
    expect(h.state.deletes).toContainEqual({
      table: 'activity_type',
      filters: [{ column: 'activity_type', value: 'MY_CUSTOM_QUIZ' }],
    });
  });

  it('rejects a malformed ladder before creating anything', async () => {
    queueRole('instructor');

    const res = await POST(makeRequest(validBody({ titles: [{ difficultyLevel: 9, titleName: 'Too high' }] })));

    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('rejects the same level twice', async () => {
    queueRole('instructor');

    const res = await POST(
      makeRequest(
        validBody({
          titles: [
            { difficultyLevel: 1, titleName: 'One' },
            { difficultyLevel: 1, titleName: 'Two' },
          ],
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('activity_type');
  });
});
