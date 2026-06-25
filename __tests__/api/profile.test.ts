import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockProfile = { id: 'user-123', username: 'testuser', biography: 'Hello!' };

const mockBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(async () => ({ data: mockProfile, error: null })),
  single: vi.fn(async () => ({ data: mockProfile, error: null })),
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) => {
        if (token === 'valid-token') {
          return { data: { user: { id: 'user-123' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }),
    },
    from: vi.fn(() => mockBuilder),
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
    const response = await POST(req('POST', { username: 'testuser', biography: 'Hello!' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ profile: mockProfile });
  });

  it('POST returns 400 when username is missing', async () => {
    const response = await POST(req('POST', { biography: 'Hello!' }));
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
});
