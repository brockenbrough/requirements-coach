import { beforeEach, describe, expect, it, vi } from 'vitest';

// Login runs on the anon-key client, register on the service-role client.
// The stub lives inside the factory because vi.mock is hoisted to the top of
// the file and cannot reach top-level variables.
vi.mock('../../lib/supabase', () => {
  const supabaseStub = () => ({
    auth: {
      signInWithPassword: vi.fn(async ({ email }: { email: string }) => {
        if (email === 'bad@example.com') {
          return { data: null, error: { message: 'Invalid credentials' } };
        }
        return { data: { user: { email } }, error: null };
      }),
      refreshSession: vi.fn(async ({ refresh_token }: { refresh_token: string }) => {
        if (refresh_token === 'expired-refresh-token') {
          return { data: { session: null }, error: { message: 'Refresh token expired' } };
        }
        return { data: { session: { access_token: 'new-access-token', refresh_token: 'new-refresh-token' } }, error: null };
      }),
      admin: {
        createUser: vi.fn(async ({ email }: { email: string }) => {
          if (email === 'exists@example.com') {
            return { data: null, error: { message: 'User exists' } };
          }
          return { data: { user: { email } }, error: null };
        }),
      },
    },
  });

  return {
    getSupabaseClient: vi.fn(supabaseStub),
    getSupabaseAuthClient: vi.fn(supabaseStub),
    getSupabaseAdminClient: vi.fn(supabaseStub),
  };
});

import { POST as registerPost } from '../../app/api/auth/register/route';
import { POST as loginPost } from '../../app/api/auth/login/route';
import { POST as refreshPost } from '../../app/api/auth/refresh/route';

describe('Auth API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a new user', async () => {
    const response = await registerPost(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', password: 'secret123' }),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ user: { email: 'new@example.com' } });
  });

  it('returns a 400 error for an existing user', async () => {
    const response = await registerPost(new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'exists@example.com', password: 'secret123' }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'User exists' });
  });

  it('logs in successfully', async () => {
    const response = await loginPost(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'student@example.com', password: 'secret123' }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ session: { user: { email: 'student@example.com' } } });
  });

  it('rejects invalid credentials', async () => {
    const response = await loginPost(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'bad@example.com', password: 'wrong' }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid credentials' });
  });

  it('exchanges a refresh token for a fresh session', async () => {
    const response = await refreshPost(new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: 'valid-refresh-token' }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      session: { session: { access_token: 'new-access-token', refresh_token: 'new-refresh-token' } },
    });
  });

  it('rejects a missing refresh token', async () => {
    const response = await refreshPost(new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'refresh_token is required.' });
  });

  it('rejects an expired refresh token', async () => {
    const response = await refreshPost(new Request('http://localhost/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: 'expired-refresh-token' }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Refresh token expired' });
  });
});
