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
 * GitHub #441: a missing profile (profile === null, i.e. the "user" row hasn't been created
 * yet — normal right after registration, or if the create-profile form was navigated away from
 * before it was submitted) sends the account to /profile for *both* roles now, not just
 * 'instructor'. It used to let a profile-less 'student' account through on the theory that the
 * DB role defaults to 'student' and there was nothing to fail closed against — but several
 * student pages (app/courses/page.tsx, app/activities/page.tsx, "My Courses") derive their own
 * data from the profile row and rendered a blank screen instead of a loading/redirect state when
 * it didn't exist. Routing every required role through /profile first — the same step every new
 * account has to take anyway — means a half-registered account can't reach a broken page, and,
 * since this check re-runs on every protected page load, a student who navigates away without
 * finishing the form is sent right back next time they land on a gated page or log back in.
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

    if (!profile) {
      router.replace('/profile');
      return;
    }

    if (requiredRole === 'instructor') {
      if (profile.role !== 'instructor') {
        router.replace('/dashboard');
      }
      return;
    }

    if (profile.role === 'instructor') {
      router.replace('/instructor');
    }
  }, [loading, token, profile, requiredRole, router]);

  const authorized =
    Boolean(token) &&
    Boolean(profile) &&
    (requiredRole === 'instructor' ? profile?.role === 'instructor' : profile?.role !== 'instructor');

  return { token, profile, loading, authorized };
}
