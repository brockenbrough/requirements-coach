import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
        createUser: vi.fn(async ({ email, user_metadata }: { email: string; user_metadata?: Record<string, unknown> }) => {
          if (email === 'exists@example.com') {
            return { data: null, error: { message: 'User exists' } };
          }
          return { data: { user: { email, user_metadata } }, error: null };
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

import { getSupabaseAdminClient } from '../../lib/supabase';
import { POST as registerPost } from '../../app/api/auth/register/route';
import { POST as loginPost } from '../../app/api/auth/login/route';
import { POST as refreshPost } from '../../app/api/auth/refresh/route';

// GitHub #280: INSTRUCTOR_SIGNUP_CODE is a real env var now, not a hardcoded literal — tests
// set/clear it directly rather than importing a shared constant from the route (there isn't
// one anymore). Saved and restored around every test so one test's value can never leak into
// the next, regardless of run order.
const ORIGINAL_INSTRUCTOR_SIGNUP_CODE = process.env.INSTRUCTOR_SIGNUP_CODE;

function registerRequest(body: Record<string, unknown>) {
  return registerPost(new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

describe('Auth API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INSTRUCTOR_SIGNUP_CODE;
  });

  afterEach(() => {
    if (ORIGINAL_INSTRUCTOR_SIGNUP_CODE === undefined) delete process.env.INSTRUCTOR_SIGNUP_CODE;
    else process.env.INSTRUCTOR_SIGNUP_CODE = ORIGINAL_INSTRUCTOR_SIGNUP_CODE;
  });

  it('registers a new user as a student by default', async () => {
    const response = await registerRequest({ email: 'new@example.com', password: 'secret123' });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ user: { email: 'new@example.com', user_metadata: { role: 'student' } } });
  });

  // GitHub #280: a plain student signup (no instructorCode) must not care whether the
  // instructor invite code is configured at all — only an actual attempt to use one does.
  it('registers a student successfully even when INSTRUCTOR_SIGNUP_CODE is unset', async () => {
    expect(process.env.INSTRUCTOR_SIGNUP_CODE).toBeUndefined();

    const response = await registerRequest({ email: 'new2@example.com', password: 'secret123' });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ user: { email: 'new2@example.com', user_metadata: { role: 'student' } } });
  });

  it('registers as an instructor when the signup code matches the configured env var', async () => {
    process.env.INSTRUCTOR_SIGNUP_CODE = 'a-real-random-invite-code';

    const response = await registerRequest({ email: 'prof@example.com', password: 'secret123', instructorCode: 'a-real-random-invite-code' });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ user: { email: 'prof@example.com', user_metadata: { role: 'instructor' } } });
  });

  it('falls back to student when the signup code is wrong but the env var is configured', async () => {
    process.env.INSTRUCTOR_SIGNUP_CODE = 'a-real-random-invite-code';

    const response = await registerRequest({ email: 'imposter@example.com', password: 'secret123', instructorCode: 'wrong-code' });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ user: { email: 'imposter@example.com', user_metadata: { role: 'student' } } });
  });

  // GitHub #280's core fix: a missing INSTRUCTOR_SIGNUP_CODE must reject the instructor signup
  // attempt outright (500, generic message) rather than silently falling back to any built-in
  // default or comparing against undefined.
  it('rejects an instructor signup attempt with a generic 500 when INSTRUCTOR_SIGNUP_CODE is unset', async () => {
    expect(process.env.INSTRUCTOR_SIGNUP_CODE).toBeUndefined();

    const response = await registerRequest({ email: 'prof2@example.com', password: 'secret123', instructorCode: 'anything' });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).not.toMatch(/CHANGE-ME|instructor_signup_code/i);
    // Never reaches Supabase at all — the misconfiguration is caught before any user is created.
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('rejects an instructor signup attempt when INSTRUCTOR_SIGNUP_CODE is still the leaked placeholder', async () => {
    process.env.INSTRUCTOR_SIGNUP_CODE = 'CHANGE-ME-instructor-2026';

    const response = await registerRequest({ email: 'prof3@example.com', password: 'secret123', instructorCode: 'CHANGE-ME-instructor-2026' });

    expect(response.status).toBe(500);
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
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
