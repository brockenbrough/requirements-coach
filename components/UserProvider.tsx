'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clearStoredAccessToken, getStoredAccessToken, refreshAccessToken } from '../lib/authClient';
import { loadStudentScore } from '../lib/sessionClient';

export type Role = 'student' | 'instructor';

export type Profile = {
  user_id: string;
  username: string;
  biography: string;
  avatar_url: string | null;
  role: Role;
  first_name: string;
  last_name: string;
  age: number | null;
  semester: number | null;
  /** GitHub #318: has the first-login guided tour been finished or skipped yet. */
  has_seen_onboarding_tour: boolean;
};

type UserContextValue = {
  token: string | null;
  profile: Profile | null;
  loading: boolean;
  /** Push a freshly-mutated profile (create/update/avatar upload) into the shared context. */
  setProfile: (profile: Profile | null) => void;
  /** Re-read the stored token and re-fetch the profile — call after login/register, before navigating. */
  refresh: () => Promise<void>;
  /** Clear token + profile on logout. */
  signOut: () => void;
  /**
   * The signed-in student's cumulative score (REQ-GAM-DL-1) — null while loading, and for an
   * instructor, who has none. GitHub #392: this is the one app-wide copy every display of the
   * score (the sidebar pill below, and anything reading lib/scoreStore.ts's cache) is meant to
   * agree with; keeping it here instead of duplicating a fetch+useState in AppShell means there
   * is exactly one effect that loads it and exactly one function that invalidates it.
   */
  score: number | null;
  /**
   * Re-fetches the score from the server (bypassing the cache) and pushes the fresh value into
   * this context. Call this once after a session completes — every play flow (MCQ and LLM-graded
   * alike) must call it, since neither the sidebar nor lib/scoreStore.ts's cache otherwise has any
   * way to learn that a just-finished session changed the total.
   */
  refreshScore: () => Promise<void>;
};

const UserContext = createContext<UserContextValue | null>(null);

// Supabase access tokens default to a ~1 hour lifetime; refresh well ahead of
// that so an open, idle tab never hits the expiry on its own.
const PROACTIVE_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

type ProfileFetchResult =
  | { kind: 'ok'; profile: Profile | null }
  | { kind: 'unauthorized' }
  | { kind: 'error' };

async function fetchProfile(accessToken: string): Promise<ProfileFetchResult> {
  let res: Response;
  try {
    res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    return { kind: 'error' };
  }

  if (res.status === 401) return { kind: 'unauthorized' };
  if (!res.ok) return { kind: 'error' };

  const data = await res.json().catch(() => null);
  return { kind: 'ok', profile: data?.profile ?? null };
}

/**
 * Single, app-wide source for the logged-in user's profile (name, avatar).
 * Mounted once in app/layout.tsx, so it survives client-side navigation
 * between pages — Sidebar/Dashboard/Profile all read the same already-loaded
 * data instead of each page re-fetching it on mount.
 *
 * This is also the only place that decides whether a session is still valid.
 * There is deliberately no "guest" fallback: a request rejected with 401 means
 * the access token is expired or revoked, so we first try the refresh token
 * (silent renewal — an open tab shouldn't be logged out just for sitting
 * idle) and only clear the session, dropping `token` to null, when that fails
 * too. Every page gates its protected content on `token`, so a null token
 * here is what sends the user back to a real "logged out" screen instead of
 * leaving a half-authenticated placeholder state on screen.
 */
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const stored = getStoredAccessToken();

    if (!stored) {
      setToken(null);
      setProfileState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let activeToken = stored;
      let result = await fetchProfile(activeToken);

      if (result.kind === 'unauthorized') {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          activeToken = refreshed;
          result = await fetchProfile(activeToken);
        }
      }

      if (result.kind === 'unauthorized') {
        // The access token was rejected and refreshing it failed too — the
        // session is genuinely over. Clear it fully rather than leaving a
        // stale token paired with no profile.
        clearStoredAccessToken();
        setToken(null);
        setProfileState(null);
        return;
      }

      if (result.kind === 'error') {
        // A transient failure (e.g. the API/Supabase is briefly unreachable).
        // Not proof the session is invalid, so the stored token is kept as-is
        // for the next attempt instead of forcing a logout on a hiccup.
        return;
      }

      setToken(activeToken);
      setProfileState(result.profile);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Best-effort keep-alive: renews the access token in the background so a
  // tab left open past its ~1h expiry doesn't wait for a failed request to
  // discover it. A failed attempt here is silently skipped — the reactive
  // path in refresh() above is what actually decides a session is over.
  useEffect(() => {
    const id = setInterval(() => {
      if (!getStoredAccessToken()) return;
      refreshAccessToken().then((newToken) => {
        if (newToken) setToken(newToken);
      });
    }, PROACTIVE_REFRESH_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  function signOut() {
    clearStoredAccessToken();
    setToken(null);
    setProfileState(null);
    setScore(null);
  }

  // Score is a student-only concept (an instructor has no sessions of their own), keyed on the
  // primitives rather than `profile` itself so a token refresh (which doesn't touch profile) or
  // an unrelated setProfile call doesn't re-trigger a fetch this effect doesn't actually need —
  // the same dependency shape AppShell's own score effect used before this moved here.
  const userId = profile?.user_id;
  const role = profile?.role;

  useEffect(() => {
    if (!token || !userId || role !== 'student') {
      setScore(null);
      return;
    }

    let cancelled = false;
    // onRevalidate (GitHub #392 follow-up): a cache hit resolves instantly, but a real request
    // still fires underneath, and corrects `score` if the cached value had gone stale — e.g. a
    // session finished in a different tab/browser profile, or a value left over from before this
    // score-caching path itself was fixed, neither of which anything else on this device would
    // otherwise ever notice.
    loadStudentScore(token, userId, {
      onRevalidate: (fresh) => {
        if (!cancelled) setScore(fresh.score);
      },
    }).then((result) => {
      if (cancelled) return;
      if (result.ok) setScore(result.data.score);
    });

    return () => {
      cancelled = true;
    };
  }, [token, userId, role]);

  const refreshScore = useCallback(async () => {
    if (!token || !userId || role !== 'student') return;
    const result = await loadStudentScore(token, userId, { forceRefresh: true });
    if (result.ok) setScore(result.data.score);
  }, [token, userId, role]);

  return (
    <UserContext.Provider
      value={{ token, profile, loading, setProfile: setProfileState, refresh, signOut, score, refreshScore }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser() must be used within <UserProvider>.');
  return ctx;
}
