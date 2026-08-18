import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_COURSE_COVER_BYTES } from '../../lib/imageRules';

type SupabaseError = { message: string } | null;
type UploadOptions = { upsert: boolean; contentType: string };

const h = vi.hoisted(() => ({
  state: { role: 'instructor' as string },
}));

const mockStorage = {
  upload: vi.fn(async (_path: string, _file: Blob, _options: UploadOptions) => ({ error: null as SupabaseError })),
  getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://example.com/course-covers/${path}` } })),
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) => {
        if (token === 'valid-token') return { data: { user: { id: 'instructor-1' } }, error: null };
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: { role: h.state.role }, error: null })),
    })),
    storage: { from: vi.fn(() => mockStorage) },
  })),
}));

import { POST } from '../../app/api/instructor/course-covers/route';

function imageBlob(signature: number[], type = 'image/png'): Blob {
  const bytes = new Uint8Array(32);
  bytes.set(signature);
  return new Blob([bytes], { type });
}

const pngBlob = () => imageBlob([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png');
const jpegBlob = () => imageBlob([0xff, 0xd8, 0xff, 0xe0], 'image/jpeg');

function makeRequest(file?: Blob, token = 'valid-token', filename = 'cover.jpg') {
  const formData = new FormData();
  if (file) formData.append('image', file, filename);
  return new Request('http://localhost/api/instructor/course-covers', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: formData,
  });
}

describe('POST /api/instructor/course-covers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.state.role = 'instructor';
    mockStorage.upload.mockResolvedValue({ error: null });
    mockStorage.getPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `https://example.com/course-covers/${path}` },
    }));
  });

  it('returns 401 without a token', async () => {
    const res = await POST(makeRequest(jpegBlob(), ''));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await POST(makeRequest(jpegBlob(), 'bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns 403 with an empty body when the caller is a student', async () => {
    h.state.role = 'student';
    const res = await POST(makeRequest(jpegBlob()));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('');
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it('returns 400 when no image is provided', async () => {
    const res = await POST(makeRequest(undefined));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'image file is required.' });
  });

  it('uploads under a per-instructor, randomly keyed path and returns its public URL', async () => {
    const res = await POST(makeRequest(pngBlob()));
    expect(res.status).toBe(200);

    const [path, , options] = mockStorage.upload.mock.calls[0] as [string, Blob, UploadOptions];
    expect(path).toMatch(/^instructor-1\/[0-9a-f-]{36}\.png$/);
    expect(options).toEqual({ upsert: false, contentType: 'image/png' });

    const body = await res.json();
    expect(body.url).toBe(`https://example.com/course-covers/${path}`);
  });

  it('rejects an SVG payload without touching storage', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], { type: 'image/svg+xml' });
    const res = await POST(makeRequest(svg, 'valid-token', 'cover.svg'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Only PNG, JPEG or WebP images are allowed.' });
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it('rejects a file over the course-cover size limit without reading it into storage', async () => {
    const oversized = new Blob([new Uint8Array(MAX_COURSE_COVER_BYTES + 1)], { type: 'image/png' });
    const res = await POST(makeRequest(oversized));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Image must be 4 MB or smaller.' });
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it('returns 500 when the storage upload fails', async () => {
    mockStorage.upload.mockResolvedValue({ error: { message: 'Bucket not found' } });
    const res = await POST(makeRequest(pngBlob()));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Bucket not found' });
  });
});
