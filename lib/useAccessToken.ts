'use client';

import { useUser } from '../components/UserProvider';

/**
 * Thin wrapper around useUser() for pages that only need the token, not the
 * full profile. Deliberately *not* its own independent read of localStorage:
 * UserProvider is the single place that decides whether a session is still
 * valid (including the silent-refresh-then-logout flow), so every page has
 * to observe that same state — otherwise a page could keep rendering as
 * "logged in" with a token UserProvider has already discarded as invalid.
 */
export function useAccessToken() {
  const { token, loading } = useUser();
  return { token, loading };
}
