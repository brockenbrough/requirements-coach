import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same three-client shape as auth.test.ts: getUser (bearer-token auth) on the default client,
// signInWithPassword (old-password check) on the anon client, admin.updateUserById (the actual
// change) on the service-role client.
vi.mock('../../lib/supabase', () => {
  const getUser = vi.fn(async (token: string) => {
    if (token === 'valid-token') {
      return { data: { user: { id: 'user-123', email: 'student@example.com' } }, error: null };
    }
    return { data: { user: null }, error: { message: 'Invalid token' } };
  });

  const signInWithPassword = vi.fn(async ({ password }: { password: string }) => {
    if (password === 'wrong-old-password') {
      return { data: null, error: { message: 'Invalid login credentials' } };
    }
    return { data: { user: { id: 'user-123' } }, error: null };
  });

  const updateUserById = vi.fn(async (_id: string, { password }: { password: string }) => {
    if (password === 'rejected-by-supabase') {
      return { data: null, error: { message: 'Password is known to be weak and easy to guess.' } };
    }
    return { data: { user: { id: 'user-123' } }, error: null };
  });

  return {
    getSupabaseClient: vi.fn(() => ({ auth: { getUser } })),
    getSupabaseAuthClient: vi.fn(() => ({ auth: { signInWithPassword } })),
    getSupabaseAdminClient: vi.fn(() => ({ auth: { admin: { updateUserById } } })),
  };
});

import { POST } from '../../app/api/profile/password/route';

function req(body?: object, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/profile/password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('POST /api/profile/password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('changes the password when the old password is correct', async () => {
    const response = await POST(req({ oldPassword: 'correct-old-password', newPassword: 'new-strong-pass' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('rejects without a token', async () => {
    const response = await POST(req({ oldPassword: 'a', newPassword: 'new-strong-pass' }, null));
    expect(response.status).toBe(401);
  });

  it('rejects an invalid or expired token', async () => {
    const response = await POST(req({ oldPassword: 'a', newPassword: 'new-strong-pass' }, 'bad-token'));
    expect(response.status).toBe(401);
  });

  it('rejects a missing old or new password', async () => {
    const response = await POST(req({ newPassword: 'new-strong-pass' }));
    expect(response.status).toBe(400);
  });

  it('rejects a new password shorter than the minimum length', async () => {
    const response = await POST(req({ oldPassword: 'correct-old-password', newPassword: 'short' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/at least/);
  });

  it('rejects an incorrect old password without changing anything', async () => {
    const response = await POST(req({ oldPassword: 'wrong-old-password', newPassword: 'new-strong-pass' }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('Current password is incorrect.');
  });

  it('surfaces a rejection from Supabase when updating the password', async () => {
    const response = await POST(req({ oldPassword: 'correct-old-password', newPassword: 'rejected-by-supabase' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Password is known to be weak and easy to guess.');
  });
});
