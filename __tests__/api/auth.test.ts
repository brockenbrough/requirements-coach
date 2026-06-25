import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(async ({ email }: { email: string }) => {
        if (email === 'bad@example.com') {
          return { data: null, error: { message: 'Invalid credentials' } };
        }
        return { data: { user: { email } }, error: null };
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
  })),
}));

import { POST as registerPost } from '../../app/api/auth/register/route';
import { POST as loginPost } from '../../app/api/auth/login/route';

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
});
