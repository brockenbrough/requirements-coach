import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

const h = vi.hoisted(() => {
  const state = {
    queues: {} as Record<string, Result[]>,
    inserts: [] as { table: string; payload: unknown }[],
    user: { id: 'instructor-1' } as { id: string } | null,
    role: 'instructor' as string,
  };

  function makeBuilder(table: string, result: Result) {
    const builder: Record<string, unknown> = {
      insert: (payload: unknown) => {
        state.inserts.push({ table, payload });
        return builder;
      },
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => result,
      then: (onOk: (r: Result) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onOk, onErr),
    };
    return builder;
  }

  return { state, makeBuilder };
});

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
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
  h.state.queues['user'] = [{ data: { role }, error: null }];
}

/** activity_type as the insert's .select(...).maybeSingle() returns it. */
function activityTypeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    activity_type: 'MY_CUSTOM_QUIZ',
    quiz_name: 'My Custom Quiz',
    description: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.state.queues = {};
  h.state.inserts = [];
  h.state.user = { id: 'instructor-1' };
  h.state.role = 'instructor';
});

describe('POST /api/activities/types', () => {
  it('returns 401 when no token is provided', async () => {
    h.state.user = null;
    const req = new Request('http://localhost/api/activities/types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Quiz' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is not an instructor', async () => {
    queueRole('student');
    const res = await POST(makeRequest({ name: 'New Quiz' }));
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
    const res = await POST(makeRequest({ name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when name has no letters or numbers to derive a key from', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest({ name: '!!! ---' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/letter or number/i);
  });

  it('returns 400 when the derived key would exceed 50 characters', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest({ name: 'A'.repeat(51) }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too long/i);
  });

  it('returns 400 when description is not a string', async () => {
    queueRole('instructor');
    const res = await POST(makeRequest({ name: 'Valid Name', description: 123 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/description/i);
  });

  it('derives the key by upper-casing and collapsing non-alphanumeric runs, matching the built-in keys\' own format', async () => {
    queueRole('instructor');
    h.state.queues['activity_type'] = [
      { data: activityTypeRow({ activity_type: 'IDENTIFY_WEAK_USER_STORIES', quiz_name: 'Identify Weak User Stories' }), error: null },
    ];

    await POST(makeRequest({ name: 'Identify Weak User Stories' }));

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect((insert?.payload as { activity_type: string }).activity_type).toBe('IDENTIFY_WEAK_USER_STORIES');
  });

  it('creates the quiz and returns the derived key, name, and description', async () => {
    queueRole('instructor');
    h.state.queues['activity_type'] = [
      { data: activityTypeRow({ description: 'A quiz about things' }), error: null },
    ];

    const res = await POST(makeRequest({ name: 'My Custom Quiz', description: 'A quiz about things' }));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.quiz).toEqual({
      activityType: 'MY_CUSTOM_QUIZ',
      name: 'My Custom Quiz',
      description: 'A quiz about things',
    });
  });

  it('trims name, and an empty/whitespace-only description is stored as null rather than an empty string', async () => {
    queueRole('instructor');
    h.state.queues['activity_type'] = [{ data: activityTypeRow(), error: null }];

    await POST(makeRequest({ name: '  My Custom Quiz  ', description: '   ' }));

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect(insert?.payload).toMatchObject({ quiz_name: 'My Custom Quiz', description: null });
  });

  it('sets creator_id from the authenticated instructor, not the request body', async () => {
    queueRole('instructor');
    h.state.queues['activity_type'] = [{ data: activityTypeRow(), error: null }];

    await POST(makeRequest({ name: 'My Custom Quiz' }));

    const insert = h.state.inserts.find((i) => i.table === 'activity_type');
    expect((insert?.payload as { creator_id: string }).creator_id).toBe('instructor-1');
  });

  // The whole point of GitHub #347's "report, don't auto-suffix": the instructor picks a
  // different name themselves, so there must be exactly one insert attempt, not a retry loop.
  it('returns 409 on a name collision, without retrying with a suffixed key', async () => {
    queueRole('instructor');
    h.state.queues['activity_type'] = [{ data: null, error: { code: '23505', message: 'duplicate key' } }];

    const res = await POST(makeRequest({ name: 'Identify Weak User Stories' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
    expect(h.state.inserts.filter((i) => i.table === 'activity_type')).toHaveLength(1);
  });

  it('returns 500 when the database returns a non-collision error', async () => {
    queueRole('instructor');
    h.state.queues['activity_type'] = [{ data: null, error: { code: '99999', message: 'DB error' } }];

    const res = await POST(makeRequest({ name: 'My Custom Quiz' }));
    expect(res.status).toBe(500);
  });
});
