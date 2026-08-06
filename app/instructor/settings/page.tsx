'use client';

import { AppShell } from '../../../components/AppShell';
import { LLMProviderSettingsForm } from '../../../components/LLMProviderSettingsForm';
import { useRequireRole } from '../../../lib/useRequireRole';

/**
 * GitHub #150: standalone route kept for deep links, but no longer the primary way instructors
 * reach these settings — that's the sidebar gear icon's LLMProviderSettingsModal (AppShell.tsx).
 * Both this page and that modal are thin hosts around the same LLMProviderSettingsForm, so the
 * fields/validation/save logic exist in exactly one place.
 */
export default function InstructorSettingsPage() {
  // Redirects non-instructors (GitHub #82/#169's role-guard convention) — a student hitting
  // this URL directly is sent to /dashboard, same as every other /instructor/* page.
  const { token, loading, authorized } = useRequireRole('instructor');

  if (loading || !authorized) return null;
  if (!token) return null;

  return (
    <AppShell active="instructor-settings">
      <div className="mx-auto max-w-lg">
        <LLMProviderSettingsForm token={token} />
      </div>
    </AppShell>
  );
}
