import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockProfile = { user_id: 'user-123', username: 'testuser', biography: 'Hello!', role: 'student' };

const mockBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(async () => ({ data: mockProfile, error: null })),
  single: vi.fn(async () => ({ data: mockProfile, error: null })),
};

// PATCH with selected_title_definition_id reaches into canWearTitle (lib/titleQueries.ts), which
// reads title_definition and session_log — tables the single shared mockBuilder above can't answer
// for, since it resolves everything to a profile row. These two are per-table and thenable, matching
// the queue-per-table style the other route tests use.
const titleState = {
  definition: null as { activity_type: string; difficulty_level: number } | null,
  sessions: [] as { activity_type: string; difficulty_level: number; passed: boolean }[],
};

function makeTitleBuilder(rows: unknown, single: unknown) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: single, error: null }),
    then: (onOk: (r: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(onOk),
  };
  return builder;
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) => {
        if (token === 'valid-token') {
          return { data: { user: { id: 'user-123', user_metadata: {} } }, error: null };
        }
        if (token === 'instructor-token') {
          return { data: { user: { id: 'user-456', user_metadata: { role: 'instructor' } } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'title_definition') return makeTitleBuilder(null, titleState.definition);
      if (table === 'session_log') return makeTitleBuilder(titleState.sessions, null);
      return mockBuilder;
    }),
  })),
}));

import { GET, POST, PATCH } from '../../app/api/profile/route';

function req(method: string, body?: object, token = 'valid-token') {
  return new Request(`http://localhost/api/profile`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Profile API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuilder.select.mockReturnThis();
    mockBuilder.eq.mockReturnThis();
    mockBuilder.update.mockReturnThis();
    mockBuilder.insert.mockReturnThis();
    mockBuilder.maybeSingle.mockResolvedValue({ data: mockProfile, error: null });
    mockBuilder.single.mockResolvedValue({ data: mockProfile, error: null });
    titleState.definition = null;
    titleState.sessions = [];
  });

  it('GET returns profile for authenticated user', async () => {
    const response = await GET(req('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile: mockProfile });
  });

  it('GET returns 401 without token', async () => {
    const response = await GET(new Request('http://localhost/api/profile'));
    expect(response.status).toBe(401);
  });

  it('GET returns 401 for invalid token', async () => {
    const response = await GET(req('GET', undefined, 'bad-token'));
    expect(response.status).toBe(401);
  });

  it('GET returns null profile when none exists', async () => {
    mockBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await GET(req('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile: null });
  });

  it('POST creates a new profile', async () => {
    const response = await POST(req('POST', { username: 'testuser', biography: 'Hello!', first_name: 'Test', last_name: 'User' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ profile: mockProfile });
  });

  it('POST defaults role to student when the token carries no instructor metadata', async () => {
    await POST(req('POST', { username: 'testuser', biography: 'Hello!', first_name: 'Test', last_name: 'User' }));
    const insertedRow = mockBuilder.insert.mock.calls[0][0];
    expect(insertedRow).toMatchObject({ role: 'student' });
  });

  it('POST sets role to instructor when the auth user metadata says so (GitHub #82)', async () => {
    await POST(req('POST', { username: 'prof', biography: 'Hi class', first_name: 'Prof', last_name: 'Smith' }, 'instructor-token'));
    const insertedRow = mockBuilder.insert.mock.calls[0][0];
    expect(insertedRow).toMatchObject({ role: 'instructor' });
  });

  it('POST returns 400 when username is missing', async () => {
    const response = await POST(req('POST', { biography: 'Hello!', first_name: 'Test', last_name: 'User' }));
    expect(response.status).toBe(400);
  });

  it('POST returns 400 when first_name is missing', async () => {
    const response = await POST(req('POST', { username: 'testuser', biography: 'Hello!', last_name: 'User' }));
    expect(response.status).toBe(400);
  });

  it('POST returns 400 when last_name is missing', async () => {
    const response = await POST(req('POST', { username: 'testuser', biography: 'Hello!', first_name: 'Test' }));
    expect(response.status).toBe(400);
  });

  it('PATCH updates biography', async () => {
    const response = await PATCH(req('PATCH', { biography: 'Updated bio' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile: mockProfile });
  });

  it('PATCH returns 400 when biography field is absent', async () => {
    const response = await PATCH(req('PATCH', {}));
    expect(response.status).toBe(400);
  });

  // GitHub #318: the guided tour's "finished/skipped/replayed" flag goes through the same
  // generic PATCH as every other profile field, rather than a dedicated route.
  it('PATCH updates has_seen_onboarding_tour', async () => {
    const response = await PATCH(req('PATCH', { has_seen_onboarding_tour: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile: mockProfile });
  });

  it('PATCH sends has_seen_onboarding_tour through to the update call', async () => {
    await PATCH(req('PATCH', { has_seen_onboarding_tour: true }));
    expect(mockBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ has_seen_onboarding_tour: true }));
  });

  // The mastery title a student wears. Which titles they may pick is decided against their own
  // session history, never against the request body — see canWearTitle (lib/titleQueries.ts).
  describe('PATCH selected_title_definition_id', () => {
    it('stores a title for a level the caller has passed', async () => {
      titleState.definition = { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 2 };
      titleState.sessions = [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 2, passed: true }];

      const response = await PATCH(req('PATCH', { selected_title_definition_id: 'title-2' }));

      expect(response.status).toBe(200);
      expect(mockBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ selected_title_definition_id: 'title-2' }),
      );
    });

    it('returns 400 and writes nothing for a title the caller has not earned', async () => {
      titleState.definition = { activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 3 };
      titleState.sessions = [{ activity_type: 'IDENTIFY_WEAK_USER_STORIES', difficulty_level: 1, passed: true }];

      const response = await PATCH(req('PATCH', { selected_title_definition_id: 'title-3' }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'You have not earned that title yet.' });
      expect(mockBuilder.update).not.toHaveBeenCalled();
    });

    it('returns 400 for a title_definition_id that does not exist', async () => {
      titleState.definition = null;

      const response = await PATCH(req('PATCH', { selected_title_definition_id: 'nope' }));

      expect(response.status).toBe(400);
      expect(mockBuilder.update).not.toHaveBeenCalled();
    });

    // Taking a title off needs no check — nobody has to have earned "no title".
    it('clears the title on null without consulting session history', async () => {
      const response = await PATCH(req('PATCH', { selected_title_definition_id: null }));

      expect(response.status).toBe(200);
      expect(mockBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ selected_title_definition_id: null }),
      );
    });
  });
});
