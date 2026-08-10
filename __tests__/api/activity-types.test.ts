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
    let insertPayload: unknown = null;
    const builder: Record<string, unknown> = {
      insert: (payload: unknown) => {
        insertPayload = payload;
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
      body: JSON.stringify({ activityType: 'NEW_ACTIVITY' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is not an instructor', async () => {
    h.state.queues['user'] = [{ data: { role: 'student' }, error: null }];
    const res = await POST(makeRequest({ activityType: 'NEW_ACTIVITY' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when activityType is missing', async () => {
    h.state.queues['user'] = [{ data: { role: 'instructor' }, error: null }];
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/activityType/i);
  });

  it('returns 400 when activityType is empty', async () => {
    h.state.queues['user'] = [{ data: { role: 'instructor' }, error: null }];
    const res = await POST(makeRequest({ activityType: '  ' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when activityType exceeds 50 characters', async () => {
    h.state.queues['user'] = [{ data: { role: 'instructor' }, error: null }];
    const res = await POST(makeRequest({ activityType: 'A'.repeat(51) }));
    expect(res.status).toBe(400);
  });

  it('creates the activity type and returns 201 with the activity_type', async () => {
    h.state.queues['user'] = [{ data: { role: 'instructor' }, error: null }];
    h.state.queues['activity_type'] = [{ data: { activity_type: 'NEW_ACTIVITY' }, error: null }];

    const res = await POST(makeRequest({ activityType: 'NEW_ACTIVITY' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.activity_type).toBe('NEW_ACTIVITY');
  });

  it('returns 409 when the activity type already exists', async () => {
    h.state.queues['user'] = [{ data: { role: 'instructor' }, error: null }];
    h.state.queues['activity_type'] = [{ data: null, error: { code: '23505', message: 'duplicate key' } }];

    const res = await POST(makeRequest({ activityType: 'EXISTING_ACTIVITY' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already exists/i);
  });

  it('returns 500 when the database returns an error', async () => {
    h.state.queues['user'] = [{ data: { role: 'instructor' }, error: null }];
    h.state.queues['activity_type'] = [{ data: null, error: { code: '99999', message: 'DB error' } }];

    const res = await POST(makeRequest({ activityType: 'NEW_ACTIVITY' }));
    expect(res.status).toBe(500);
  });
});
