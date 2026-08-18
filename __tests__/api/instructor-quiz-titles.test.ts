import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same harness as __tests__/api/instructor-quiz-detail.test.ts, extended with insert/update/delete
// — PUT writes the ladder through saveTitleLadder's select-then-insert-or-update-then-delete
// sequence (lib/titleAuthoringQueries.ts).
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    inserts: [] as { table: string; payload: unknown }[],
    updates: [] as { table: string; payload: unknown; filters: { column: string; value: unknown }[] }[],
    deletes: [] as { table: string; filters: { column: string; value: unknown }[] }[],
  };

  function makeBuilder(table: string, result: Result) {
    const filters: { column: string; value: unknown }[] = [];
    let pendingUpdatePayload: unknown = null;

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      update: (payload: unknown) => {
        pendingUpdatePayload = payload;
        return builder;
      },
      delete: () => {
        state.deletes.push({ table, filters });
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        if (pendingUpdatePayload !== null) state.updates.push({ table, payload: pendingUpdatePayload, filters: [...filters] });
        return builder;
      },
      in: (column: string, value: unknown) => {
        filters.push({ column, value });
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

import { PUT } from '../../app/api/instructor/quizzes/[activityType]/titles/route';

const ACTIVITY_TYPE = 'MY_CATALOG';

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function quizRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: ACTIVITY_TYPE,
    quiz_name: 'My Catalog',
    description: null,
    grading_kind: 'mcq',
    creator_id: 'instructor-1',
    creator: null,
    ...overrides,
  };
}

function req(body: unknown, token: string | null = 'valid-token') {
  return PUT(
    new Request(`http://localhost/api/instructor/quizzes/${ACTIVITY_TYPE}/titles`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: { activityType: ACTIVITY_TYPE } },
  );
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.inserts = [];
  h.state.updates = [];
  h.state.deletes = [];
});

describe('PUT /api/instructor/quizzes/{activityType}/titles', () => {
  it('returns 401 without a token', async () => {
    const res = await req({ titles: [] }, null);
    expect(res.status).toBe(401);
  });

  it('returns a bodyless 403 for a student', async () => {
    queueRole('student');
    const res = await req({ titles: [] });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
  });

  it('returns 404 for an unknown catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: null, error: null });

    const res = await req({ titles: [{ difficultyLevel: 1, titleName: 'Story Apprentice' }] });

    expect(res.status).toBe(404);
    expect(h.state.inserts).toHaveLength(0);
  });

  // 404-then-403, the ordering findOwnedCourse established: existence first, then ownership.
  it('returns a bodyless 403 for a catalog owned by someone else', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: 'instructor-2' }), error: null });

    const res = await req({ titles: [{ difficultyLevel: 1, titleName: 'Story Apprentice' }] });

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.inserts).toHaveLength(0);
  });

  // A built-in catalog has creator_id NULL, so nobody owns it and nobody can rename its ladder.
  it('returns 403 for a built-in catalog', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow({ creator_id: null }), error: null });

    const res = await req({ titles: [{ difficultyLevel: 1, titleName: 'Story Apprentice' }] });

    expect(res.status).toBe(403);
  });

  it('rejects a malformed ladder before looking the catalog up', async () => {
    queueRole('instructor');

    const res = await req({ titles: [{ difficultyLevel: 7, titleName: 'Too high' }] });

    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('activity_type');
  });

  it('saves a new rung and returns it as stored', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('title_definition', { data: [], error: null }); // saveTitleLadder's existing-rows lookup: none yet
    queue('title_definition', { data: null, error: null }); // the insert
    queue('title_definition', {
      data: [{ difficulty_level: 1, title_name: 'Story Apprentice' }],
      error: null,
    }); // the re-read

    const res = await req({ titles: [{ difficultyLevel: 1, titleName: 'Story Apprentice' }] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ titles: [{ difficultyLevel: 1, titleName: 'Story Apprentice' }] });
    expect(h.state.inserts).toHaveLength(1);
    expect(h.state.updates).toHaveLength(0);
  });

  // GitHub #464 follow-up regression: renaming an already-selected title must UPDATE the existing
  // row in place, never touch its id — that's what used to violate fk_user_title_definition.
  it('renames an existing rung by updating it in place, without touching its id', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('title_definition', {
      data: [{ title_definition_id: 'existing-id', difficulty_level: 1 }],
      error: null,
    }); // saveTitleLadder's existing-rows lookup: already has a row at level 1
    queue('title_definition', { data: null, error: null }); // the update
    queue('title_definition', {
      data: [{ difficulty_level: 1, title_name: 'Renamed Title' }],
      error: null,
    }); // the re-read

    const res = await req({ titles: [{ difficultyLevel: 1, titleName: 'Renamed Title' }] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ titles: [{ difficultyLevel: 1, titleName: 'Renamed Title' }] });
    expect(h.state.inserts).toHaveLength(0);
    expect(h.state.updates).toEqual([
      {
        table: 'title_definition',
        payload: { title_name: 'Renamed Title' },
        filters: [{ column: 'title_definition_id', value: 'existing-id' }],
      },
    ]);
  });

  it('clears a rung sent as an empty string', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('title_definition', { data: null, error: null }); // the delete
    queue('title_definition', { data: [], error: null }); // the re-read

    const res = await req({ titles: [{ difficultyLevel: 2, titleName: '' }] });

    expect(res.status).toBe(200);
    expect(h.state.inserts).toHaveLength(0);
    expect(h.state.updates).toHaveLength(0);
    expect(h.state.deletes[0].filters).toEqual([
      { column: 'activity_type', value: ACTIVITY_TYPE },
      { column: 'difficulty_level', value: [2] },
    ]);
  });

  it('returns 500 when the save fails', async () => {
    queueRole('instructor');
    queue('activity_type', { data: quizRow(), error: null });
    queue('title_definition', { data: null, error: { message: 'db down' } });

    const res = await req({ titles: [{ difficultyLevel: 1, titleName: 'Story Apprentice' }] });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'db down' });
  });
});
