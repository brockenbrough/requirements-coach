'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useUser } from '../components/UserProvider';
import type { Role } from '../components/UserProvider';

/**
 * Gates a page on the signed-in user's role (GitHub #82), redirecting instead of rendering
 * when it doesn't match. Callers should bail out of rendering while `!authorized` — the effect
 * below fires after first render, so returning null (or a loading state) until then is what
 * keeps a mismatched role from seeing a flash of the wrong page.
 *
 * The two roles are deliberately asymmetric about a missing profile (profile === null, i.e. the
 * "user" row hasn't been created yet — normal right after registration):
 * - required: 'student' allows it through. The DB default is 'student', there is nothing to
 *   fail closed against, and every existing student page already tolerated a profile-less
 *   account before this hook existed.
 * - required: 'instructor' does not. Only an explicit profile.role === 'instructor' grants
 *   access; an unconfirmed account is sent to /profile to finish setup first (the same step
 *   every new account has to take anyway) rather than rendering instructor data on a guess.
 */
export function useRequireRole(requiredRole: Role) {
  const router = useRouter();
  const { token, profile, loading } = useUser();

  useEffect(() => {
    if (loading) return;

    if (!token) {
      router.replace('/login');
      return;
    }

    if (requiredRole === 'instructor') {
      if (!profile) {
        router.replace('/profile');
      } else if (profile.role !== 'instructor') {
        router.replace('/dashboard');
      }
      return;
    }

    if (profile && profile.role === 'instructor') {
      router.replace('/instructor');
    }
  }, [loading, token, profile, requiredRole, router]);

  const authorized =
    Boolean(token) &&
    (requiredRole === 'instructor' ? profile?.role === 'instructor' : !profile || profile.role !== 'instructor');

  return { token, profile, loading, authorized };
}
