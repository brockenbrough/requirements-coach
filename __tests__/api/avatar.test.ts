import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_AVATAR_BYTES } from '../../lib/imageRules';

const mockProfile = { user_id: 'user-123', username: 'testuser', biography: 'Hello!', avatar_url: 'https://example.com/avatars/user-123.jpg', role: 'student' };

type SupabaseError = { message: string } | null;
type UploadOptions = { upsert: boolean; contentType: string };

const mockBuilder = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  single: vi.fn(async () => ({ data: mockProfile as typeof mockProfile | null, error: null as SupabaseError })),
};

// upload()'s parameters are spelled out so mock.calls is typed — the assertions below are all about
// which key and contentType the route derived, which is the substance of GitHub #278.
const mockStorage = {
  upload: vi.fn(async (_path: string, _file: Blob, _options: UploadOptions) => ({ error: null as SupabaseError })),
  remove: vi.fn(async (_paths: string[]) => ({ error: null as SupabaseError })),
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
    storage: { from: vi.fn(() => mockStorage) },
  })),
}));

import { POST } from '../../app/api/profile/avatar/route';

/**
 * Real magic bytes matter now: the route sniffs the header instead of trusting `file.type` or the
 * filename, so a placeholder like new Blob(['fake-image']) is rejected as "not an image".
 */
function imageBlob(signature: number[], type = 'image/png'): Blob {
  const bytes = new Uint8Array(32);
  bytes.set(signature);
  return new Blob([bytes], { type });
}

const pngBlob = (type?: string) => imageBlob([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], type ?? 'image/png');
const jpegBlob = () => imageBlob([0xff, 0xd8, 0xff, 0xe0], 'image/jpeg');
const webpBlob = () =>
  imageBlob([0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50], 'image/webp');

function makeRequest(file?: Blob, token = 'valid-token', filename = 'avatar.jpg') {
  const formData = new FormData();
  if (file) formData.append('image', file, filename);
  return new Request('http://localhost/api/profile/avatar', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: formData,
  });
}

/** The storage key the route passed to upload() — the whole point of GitHub #278. */
function uploadedPath(): string {
  return mockStorage.upload.mock.calls[0][0];
}

function uploadOptions(): UploadOptions {
  return mockStorage.upload.mock.calls[0][2];
}

describe('Avatar upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuilder.update.mockReturnThis();
    mockBuilder.eq.mockReturnThis();
    mockBuilder.select.mockReturnThis();
    mockBuilder.single.mockResolvedValue({ data: mockProfile, error: null });
    mockStorage.upload.mockResolvedValue({ error: null });
    mockStorage.remove.mockResolvedValue({ error: null });
    mockStorage.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/avatars/user-123.jpg' } });
  });

  it('uploads an image and returns updated profile', async () => {
    const response = await POST(makeRequest(jpegBlob()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profile: mockProfile });
  });

  it('returns 401 without a token', async () => {
    const response = await POST(makeRequest(jpegBlob(), ''));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await POST(makeRequest(jpegBlob(), 'bad-token'));
    expect(response.status).toBe(401);
  });

  it('returns 400 when no image is provided', async () => {
    const response = await POST(makeRequest(undefined));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'image file is required.' });
  });

  it('returns 400 when storage upload fails', async () => {
    mockStorage.upload.mockResolvedValue({ error: { message: 'Bucket not found' } });
    const response = await POST(makeRequest(jpegBlob()));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Bucket not found' });
  });

  it('returns 400 when profile update fails', async () => {
    mockBuilder.single.mockResolvedValue({ data: null, error: { message: 'Profile not found' } });
    const response = await POST(makeRequest(jpegBlob()));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Profile not found' });
  });

  describe('format whitelist (GitHub #278)', () => {
    it.each([
      ['PNG', pngBlob, 'user-123.png', 'image/png'],
      ['JPEG', jpegBlob, 'user-123.jpg', 'image/jpeg'],
      ['WebP', webpBlob, 'user-123.webp', 'image/webp'],
    ])('accepts %s and derives the key and contentType from the bytes', async (_label, blob, path, contentType) => {
      const response = await POST(makeRequest((blob as () => Blob)()));
      expect(response.status).toBe(200);
      expect(uploadedPath()).toBe(path);
      expect(uploadOptions()).toEqual({ upsert: true, contentType });
    });

    it('rejects an SVG payload without touching storage', async () => {
      const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], { type: 'image/svg+xml' });
      const response = await POST(makeRequest(svg, 'valid-token', 'avatar.svg'));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Only PNG, JPEG or WebP images are allowed.' });
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('rejects an HTML payload disguised as a PNG', async () => {
      const html = new Blob(['<!DOCTYPE html><script>alert(document.cookie)</script>'], { type: 'image/png' });
      const response = await POST(makeRequest(html, 'valid-token', 'avatar.png'));
      expect(response.status).toBe(400);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('ignores the client-supplied filename and MIME type entirely', async () => {
      // Real PNG bytes, but the client claims it is HTML and names it evil.html. The old route
      // built the key from that name, which is what made the bucket serve executable content.
      const response = await POST(makeRequest(pngBlob('text/html'), 'valid-token', 'evil.html'));
      expect(response.status).toBe(200);
      expect(uploadedPath()).toBe('user-123.png');
      expect(uploadOptions().contentType).toBe('image/png');
    });

    it('cannot be pushed out of the user id namespace by a path-like filename', async () => {
      const response = await POST(makeRequest(pngBlob(), 'valid-token', '../other-user/avatar.png'));
      expect(response.status).toBe(200);
      expect(uploadedPath()).toBe('user-123.png');
    });
  });

  describe('size limit (GitHub #278)', () => {
    it('rejects a file over the limit without reading it into storage', async () => {
      const oversized = new Blob([new Uint8Array(MAX_AVATAR_BYTES + 1)], { type: 'image/png' });
      const response = await POST(makeRequest(oversized));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Image must be 2 MB or smaller.' });
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('rejects an empty file', async () => {
      const response = await POST(makeRequest(new Blob([], { type: 'image/png' })));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'The image file is empty.' });
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });
  });

  it('removes the previous avatar stored under a different extension', async () => {
    const response = await POST(makeRequest(pngBlob()));
    expect(response.status).toBe(200);
    expect(mockStorage.remove).toHaveBeenCalledWith(['user-123.jpg', 'user-123.webp']);
  });
});
