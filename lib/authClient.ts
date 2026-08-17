'use client';

// Single place where the UI talks to the auth API routes and where the
// resulting session is persisted. Swap the localStorage handling here once
// real Supabase session handling (cookies) replaces the current bearer-token
// approach — no page needs to change.
import { clearAllClientCaches } from './clientCaches';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export type AuthResult = { ok: true; role?: 'student' | 'instructor' } | { ok: false; error: string };

type StoredSession = { access_token?: string; refresh_token?: string } | null | undefined;

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getStoredRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Ends the session locally: tokens first, then every cache keyed off the account behind them.
 *
 * The cache clearing lives here rather than in signOut() so it cannot be skipped — both callers
 * in components/UserProvider.tsx go through this function, the explicit sign-out as well as the
 * path that gives up after refreshAccessToken() fails.
 */
export function clearStoredAccessToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearAllClientCaches();
}

/** Persists a Supabase session (access + refresh token) and returns the access token, or null if it didn't include one. */
function storeSession(session: StoredSession): string | null {
  if (!session?.access_token) return null;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
  if (session.refresh_token) window.localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
  return session.access_token;
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
 * POSTs to /api/auth/login and stores the access + refresh token on success.
 * The route answers with { session: <supabase signInWithPassword data> },
 * so the tokens sit at session.session.access_token / .refresh_token.
 */
export async function login(email: string, password: string): Promise<AuthResult> {
  const response = await postJson('/api/auth/login', { email, password });

  if (!response) return { ok: false, error: 'Could not reach the server. Please try again.' };
  if (!response.ok) return { ok: false, error: response.body?.error || 'Login failed.' };

  const accessToken = storeSession(response.body?.session?.session);
  if (!accessToken) return { ok: false, error: 'Login succeeded but no session was returned.' };

  return { ok: true };
}

/**
 * POSTs to /api/auth/register and then signs the new user in, because the
 * register route uses the admin API (createUser) and therefore returns a user
 * but no session.
 *
 * instructorCode is passed through as-is and checked only on the server (GitHub #82) — this
 * function never compares it itself, so there is nothing here for the browser to bypass.
 *
 * The server always creates the account, even for a wrong/unrecognized instructorCode — it
 * just silently falls back to 'student' (GitHub #82's own design, so a scripted guesser can't
 * distinguish "wrong code" from "no code" via the HTTP status). The role it actually granted
 * comes back in the response body regardless, so the caller (GitHub #440) can tell a student
 * who *meant* to register as an instructor that their code didn't take, instead of silently
 * dropping them into a student account with no explanation.
 */
export async function register(email: string, password: string, instructorCode?: string): Promise<AuthResult> {
  const response = await postJson('/api/auth/register', { email, password, instructorCode });

  if (!response) return { ok: false, error: 'Could not reach the server. Please try again.' };
  if (!response.ok) return { ok: false, error: response.body?.error || 'Registration failed.' };

  const signIn = await login(email, password);
  if (!signIn.ok) {
    return { ok: false, error: 'Account created, but automatic sign-in failed. Please log in.' };
  }

  const role = response.body?.user?.user_metadata?.role;
  return { ok: true, role: role === 'instructor' ? 'instructor' : 'student' };
}

/**
 * Exchanges the stored refresh token for a fresh access token, so an open tab
 * survives the access token's short expiry (Supabase defaults to ~1h) without
 * forcing a login — the standard "silent refresh" a real session needs instead
 * of falling back to some unauthenticated placeholder state.
 *
 * Returns the new access token on success, or null when there is no refresh
 * token or Supabase rejects it (expired/revoked) — the caller then treats the
 * session as genuinely over and must sign the user out.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  const response = await postJson('/api/auth/refresh', { refresh_token: refreshToken });
  if (!response || !response.ok) return null;

  return storeSession(response.body?.session?.session);
}
