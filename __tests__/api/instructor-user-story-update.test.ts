import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

// Same vi.hoisted queue-per-table harness as instructor-question-update.test.ts, plus recorded
// updates/deletes — this route's whole job is deciding whether the write happens at all, so the
// assertions are mostly "and nothing was written".
const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    tables: [] as string[],
    filters: [] as { table: string; column: string; value: unknown }[],
    updates: [] as { table: string; payload: unknown }[],
    deletes: [] as string[],
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ table, column, value });
        return builder;
      },
      update: (payload: unknown) => {
        state.updates.push({ table, payload });
        return builder;
      },
      delete: () => {
        state.deletes.push(table);
        return builder;
      },
      is: () => builder,
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

import { DELETE, PATCH } from '../../app/api/instructor/user-stories/[userStoryId]/route';

const PARAMS = { params: { userStoryId: 'story-1' } };

function queueRole(role: string) {
  queue('user', { data: { role }, error: null });
}

function queueGradingKind(gradingKind: string | null) {
  queue('activity_type', { data: gradingKind === null ? null : { grading_kind: gradingKind }, error: null });
}

/** The ownership lookup requireOwnedUserStory does before either write. */
function queueOwner(creatorId: string | null | undefined) {
  queue('user_story', {
    data: creatorId === undefined ? null : { user_story_id: 'story-1', creator_id: creatorId },
    error: null,
  });
}

function patchRequest(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/user-stories/story-1', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deleteRequest(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/instructor/user-stories/story-1', {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function validBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    storyText: 'As a shopper, I want a wishlist, so that I can save items for later.',
    activityType: 'WRITE_ACCEPTANCE_CRITERIA',
    difficultyLevel: 3,
    ...overrides,
  };
}

beforeEach(() => {
  h.state.queues = {};
  h.state.tables = [];
  h.state.filters = [];
  h.state.updates = [];
  h.state.deletes = [];
});

describe('PATCH /api/instructor/user-stories/[userStoryId]', () => {
  it('returns 401 without a token', async () => {
    const res = await PATCH(patchRequest(validBody(), null), PARAMS);
    expect(res.status).toBe(401);
    expect(h.state.updates).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await PATCH(patchRequest(validBody()), PARAMS);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.updates).toEqual([]);
  });

  it('returns 400 when the body fails validation, before looking the prompt up', async () => {
    queueRole('instructor');
    const res = await PATCH(patchRequest(validBody({ storyText: '  ' })), PARAMS);
    expect(res.status).toBe(400);
    expect(h.state.tables).not.toContain('user_story');
  });

  it('returns 400 when the target catalog is a multiple-choice quiz', async () => {
    queueRole('instructor');
    queueGradingKind('mcq');

    const res = await PATCH(patchRequest(validBody({ activityType: 'IDENTIFY_WEAK_USER_STORIES' })), PARAMS);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/LLM-graded/i);
    expect(h.state.updates).toEqual([]);
  });

  it('returns 404 for an unknown prompt', async () => {
    queueRole('instructor');
    queueGradingKind('llm-graded');
    queueOwner(undefined);

    const res = await PATCH(patchRequest(validBody()), PARAMS);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
    expect(h.state.updates).toEqual([]);
  });

  it('returns 403 for a prompt another instructor authored', async () => {
    queueRole('instructor');
    queueGradingKind('llm-graded');
    queueOwner('instructor-2');

    const res = await PATCH(patchRequest(validBody()), PARAMS);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/do not own/i);
    expect(h.state.updates).toEqual([]);
  });

  // A seeded prompt is owned by nobody, so no instructor can edit it through this route.
  it('returns 403 for a seeded prompt with a null creator_id', async () => {
    queueRole('instructor');
    queueGradingKind('llm-graded');
    queueOwner(null);

    const res = await PATCH(patchRequest(validBody()), PARAMS);
    expect(res.status).toBe(403);
    expect(h.state.updates).toEqual([]);
  });

  it('updates text, catalog and level, and returns 200', async () => {
    queueRole('instructor');
    queueGradingKind('llm-graded');
    queueOwner('instructor-1');
    queue('user_story', { error: null });

    const res = await PATCH(patchRequest(validBody({ storyText: '  Trimmed prompt.  ' })), PARAMS);
    expect(res.status).toBe(200);

    expect(h.state.updates).toEqual([
      {
        table: 'user_story',
        payload: {
          story_text: 'Trimmed prompt.',
          activity_type: 'WRITE_ACCEPTANCE_CRITERIA',
          difficulty_level: 3,
        },
      },
    ]);

    const body = await res.json();
    expect(body.userStoryId).toBe('story-1');
  });

  it('returns 500 when the update fails', async () => {
    queueRole('instructor');
    queueGradingKind('llm-graded');
    queueOwner('instructor-1');
    queue('user_story', { error: { message: 'DB down' } });

    const res = await PATCH(patchRequest(validBody()), PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});

describe('DELETE /api/instructor/user-stories/[userStoryId]', () => {
  it('returns 401 without a token', async () => {
    const res = await DELETE(deleteRequest(null), PARAMS);
    expect(res.status).toBe(401);
    expect(h.state.deletes).toEqual([]);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    queueRole('student');
    const res = await DELETE(deleteRequest(), PARAMS);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(h.state.deletes).toEqual([]);
  });

  it('returns 404 for an unknown prompt', async () => {
    queueRole('instructor');
    queueOwner(undefined);

    const res = await DELETE(deleteRequest(), PARAMS);
    expect(res.status).toBe(404);
    expect(h.state.deletes).toEqual([]);
  });

  it('returns 403 for a prompt another instructor authored', async () => {
    queueRole('instructor');
    queueOwner('instructor-2');

    const res = await DELETE(deleteRequest(), PARAMS);
    expect(res.status).toBe(403);
    expect(h.state.deletes).toEqual([]);
  });

  // fk_session_to_user_story_user_story carries no ON DELETE clause, so this would fail at the
  // database anyway — checking first turns a constraint error into an explanation.
  it('returns 409 when the prompt was already drawn into a session', async () => {
    queueRole('instructor');
    queueOwner('instructor-1');
    queue('session_to_user_story', { data: { session_to_user_story_id: 7 }, error: null });
    queue('submission', { data: null, error: null });

    const res = await DELETE(deleteRequest(), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already been used/i);
    expect(h.state.deletes).toEqual([]);
  });

  // submission is checked separately rather than assumed to follow from a draw row, because
  // submission.session_id is nullable — a submission can exist without one.
  it('returns 409 when the prompt has a submission but no draw row', async () => {
    queueRole('instructor');
    queueOwner('instructor-1');
    queue('session_to_user_story', { data: null, error: null });
    queue('submission', { data: { submission_id: 'sub-1' }, error: null });

    const res = await DELETE(deleteRequest(), PARAMS);
    expect(res.status).toBe(409);
    expect(h.state.deletes).toEqual([]);
  });

  it('deletes an unused prompt and returns 200', async () => {
    queueRole('instructor');
    queueOwner('instructor-1');
    queue('session_to_user_story', { data: null, error: null });
    queue('submission', { data: null, error: null });
    queue('user_story', { error: null });

    const res = await DELETE(deleteRequest(), PARAMS);
    expect(res.status).toBe(200);

    expect(h.state.deletes).toEqual(['user_story']);
    expect(h.state.filters).toContainEqual({ table: 'user_story', column: 'user_story_id', value: 'story-1' });

    const body = await res.json();
    expect(body.userStoryId).toBe('story-1');
  });

  it('returns 500 when the delete fails', async () => {
    queueRole('instructor');
    queueOwner('instructor-1');
    queue('session_to_user_story', { data: null, error: null });
    queue('submission', { data: null, error: null });
    queue('user_story', { error: { message: 'DB down' } });

    const res = await DELETE(deleteRequest(), PARAMS);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('DB down');
  });
});
