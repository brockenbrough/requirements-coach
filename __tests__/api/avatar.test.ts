import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockProfile = { id: 'user-123', username: 'testuser', biography: 'Hello!', avatar_url: 'https://example.com/avatars/user-123.jpg' };

const mockBuilder = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({ data: mockProfile, error: null })),
};

const mockStorage = {
  upload: vi.fn(async () => ({ error: null })),
  getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/avatars/user-123.jpg' } })),
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
    storage: {
      from: vi.fn(() => mockStorage),
    },
  })),
}));

import { POST } from '../../app/api/profile/avatar/route';

function makeRequest(file?: Blob, token = 'valid-token') {
  const formData = new FormData();
  if (file) formData.append('image', file, 'avatar.jpg');
  return new Request('http://localhost/api/profile/avatar', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: formData,
  });
}

describe('Avatar upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuilder.update.mockReturnThis();
    mockBuilder.eq.mockReturnThis();
    mockBuilder.select.mockReturnThis();
    mockBuilder.single.mockResolvedValue({ data: mockProfile, error: null });
    mockStorage.upload.mockResolvedValue({ error: null });
    mockStorage.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/avatars/user-123.jpg' } });
  });

  it('uploads an image and returns updated profile', async () => {
    const file = new Blob(['fake-image'], { type: 'image/jpeg' });
    const response = await POST(makeRequest(file));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile: mockProfile });
  });

  it('returns 401 without a token', async () => {
    const file = new Blob(['fake-image'], { type: 'image/jpeg' });
    const response = await POST(makeRequest(file, ''));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const file = new Blob(['fake-image'], { type: 'image/jpeg' });
    const response = await POST(makeRequest(file, 'bad-token'));
    expect(response.status).toBe(401);
  });

  it('returns 400 when no image is provided', async () => {
    const response = await POST(makeRequest(undefined));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'image file is required.' });
  });

  it('returns 400 when storage upload fails', async () => {
    mockStorage.upload.mockResolvedValue({ error: { message: 'Bucket not found' } });
    const file = new Blob(['fake-image'], { type: 'image/jpeg' });
    const response = await POST(makeRequest(file));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Bucket not found' });
  });

  it('returns 400 when profile update fails', async () => {
    mockBuilder.single.mockResolvedValue({ data: null, error: { message: 'Profile not found' } });
    const file = new Blob(['fake-image'], { type: 'image/jpeg' });
    const response = await POST(makeRequest(file));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Profile not found' });
  });
});
