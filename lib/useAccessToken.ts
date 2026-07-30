'use client';

import { useEffect, useState } from 'react';
import { getStoredAccessToken } from './authClient';

// Reads the session stored by lib/authClient on login/register, so every
// REQ-PL-6 screen gates on the same session in the same way.
export function useAccessToken() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setToken(getStoredAccessToken());
    setLoading(false);
  }, []);

  return { token, loading };
}
