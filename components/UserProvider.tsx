'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clearStoredAccessToken, getStoredAccessToken } from '../lib/authClient';

export type Profile = {
  user_id: string;
  username: string;
  biography: string;
  avatar_url: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  semester: number | null;
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
};

const UserContext = createContext<UserContextValue | null>(null);

/**
 * Single, app-wide source for the logged-in user's profile (name, avatar).
 * Mounted once in app/layout.tsx, so it survives client-side navigation
 * between pages — Sidebar/Dashboard/Profile all read the same already-loaded
 * data instead of each page re-fetching it on mount.
 */
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const stored = getStoredAccessToken();
    setToken(stored);

    if (!stored) {
      setProfileState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${stored}` } });
      const data = await res.json().catch(() => null);
      setProfileState(res.ok ? (data?.profile ?? null) : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function signOut() {
    clearStoredAccessToken();
    setToken(null);
    setProfileState(null);
  }

  return (
    <UserContext.Provider value={{ token, profile, loading, setProfile: setProfileState, refresh, signOut }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser() must be used within <UserProvider>.');
  return ctx;
}
