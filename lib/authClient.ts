'use client';

// Single place where the UI talks to the auth API routes and where the
// resulting session is persisted. Swap the localStorage handling here once
// real Supabase session handling (cookies / refresh tokens) replaces the
// current access_token approach — no page needs to change.
const ACCESS_TOKEN_KEY = 'access_token';

export type AuthResult = { ok: true } | { ok: false; error: string };

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearStoredAccessToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

type JsonResponse = { status: number; ok: boolean; body: any };

async function postJson(url: string, payload: unknown): Promise<JsonResponse | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, body };
  } catch {
    return null;
  }
}

/**
 * POSTs to /api/auth/login and stores the access token on success.
 * The route answers with { session: <supabase signInWithPassword data> },
 * so the token sits at session.session.access_token.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  const response = await postJson('/api/auth/login', { email, password });

  if (!response) return { ok: false, error: 'Could not reach the server. Please try again.' };
  if (!response.ok) return { ok: false, error: response.body?.error || 'Login failed.' };

  const accessToken = response.body?.session?.session?.access_token;
  if (!accessToken) return { ok: false, error: 'Login succeeded but no session was returned.' };

  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  return { ok: true };
}

/**
 * POSTs to /api/auth/register and then signs the new user in, because the
 * register route uses the admin API (createUser) and therefore returns a user
 * but no session.
 */
export async function register(email: string, password: string): Promise<AuthResult> {
  const response = await postJson('/api/auth/register', { email, password });

  if (!response) return { ok: false, error: 'Could not reach the server. Please try again.' };
  if (!response.ok) return { ok: false, error: response.body?.error || 'Registration failed.' };

  const signIn = await login(email, password);
  if (!signIn.ok) {
    return { ok: false, error: 'Account created, but automatic sign-in failed. Please log in.' };
  }

  return { ok: true };
}
