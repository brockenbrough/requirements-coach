'use client';

import { useEffect, useState } from 'react';

// Mirrors the token check already used in app/profile/page.tsx, factored out
// so every new REQ-PL-6 screen gates on the same localStorage-based session
// in the same way. Swap this out once real Supabase session handling
// (cookies / refresh tokens) replaces the current localStorage access_token.
export function useAccessToken() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setToken(localStorage.getItem('access_token'));
    setLoading(false);
  }, []);

  return { token, loading };
}
