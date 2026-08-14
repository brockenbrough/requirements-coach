'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ActivityDetailSkeleton } from '../../../components/ActivityDetailSkeleton';
import { AppShell } from '../../../components/AppShell';
import { CompletedAttemptsTable } from '../../../components/CompletedAttemptsTable';
import { LevelReplaySelector } from '../../../components/LevelReplaySelector';
import { ResumeOrAbandonPrompt } from '../../../components/ResumeOrAbandonPrompt';
import {
  type CurrentAcSessionResult,
  loadCurrentAcceptanceCriteriaSession,
  startOrResumeAcceptanceCriteriaSession,
} from '../../../lib/acceptanceCriteriaClient';
import { STORIES_PER_SESSION } from '../../../lib/acceptanceCriteriaRules';
import { getActivity } from '../../../lib/activityContent';
import { abandonSession, loadActivityLog, loadCompletedAttempts, type CompletedAttempt } from '../../../lib/sessionClient';
import { useRequireRole } from '../../../lib/useRequireRole';

const ACTIVITY = getActivity('write-acceptance-criteria')!;

/**
 * Landing page for Write Acceptance Criteria — Start / Resume-Abandon / previous-attempts, the
 * AC equivalent of app/activities/[slug]/page.tsx. Split from the writing/feedback/summary UI
 * (now app/activities/write-acceptance-criteria/play/page.tsx) so abandon has a real page to
 * land on instead of resetting the session in place (the bug this split fixes).
 */
export default function WriteAcceptanceCriteriaLandingPage() {
  const router = useRouter();
  // Also redirects an instructor account away (GitHub #82) — starting/resuming/abandoning this
  // activity is exactly the "quiz durchführen" capability instructors must not have.
  const { token, profile, loading, authorized } = useRequireRole('student');

  // The server is the only source of "does this activity have a run in progress" — there is no
  // local/mock notion of progress any more. null means "not checked yet or nothing running".
  const [current, setCurrent] = useState<CurrentAcSessionResult | null>(null);
  const [attempts, setAttempts] = useState<CompletedAttempt[] | null>(null);
  // True until the current-session and completed-attempts fetches below have both resolved —
  // the hero card renders nothing real before then, only ActivityDetailSkeleton (same as
  // app/activities/[slug]/page.tsx).
  const [isLoading, setIsLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [error, setError] = useState<{ message: string; needsProfile: boolean } | null>(null);

  // Both reads in one pass, because this page re-runs them on every return from /play: the
  // running session decides Start vs. Resume/Abandon, the finished ones fill the history below.
  useEffect(() => {
    if (!token || !profile?.user_id) {
      // Nothing to fetch yet — don't leave the skeleton spinning forever waiting on a load that
      // was never started (see app/activities/[slug]/page.tsx's identical guard).
      setIsLoading(false);
      return;
    }
    let cancelled = false;

    Promise.all([
      loadCurrentAcceptanceCriteriaSession(token),
      loadCompletedAttempts(token, profile.user_id, 'WRITE_ACCEPTANCE_CRITERIA'),
    ]).then(([currentResult, completed]) => {
      if (cancelled) return;
      if (currentResult.ok) setCurrent(currentResult.data);
      if (completed.ok) setAttempts(completed.data.attempts);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile?.user_id]);

  if (loading || !authorized) return null;

  async function handleStart() {
    if (!token || starting) return;

    setStarting(true);
    setError(null);

    const result = await startOrResumeAcceptanceCriteriaSession(token);

    if (result.ok) {
      // A fresh (or resumed) session now shows up in the activity log too.
      if (profile?.user_id) {
        void loadActivityLog(token, profile.user_id, { forceRefresh: true });
      }
      router.push('/activities/write-acceptance-criteria/play');
      return;
    }

    setStarting(false);

    if (result.status === 401) {
      router.push('/login');
      return;
    }

    // 409: authenticated, but no row in "user" yet — registration does not create one, and
    // session_log.user_id references it.
    setError({ message: result.error, needsProfile: result.status === 409 });
  }

  function handleResume() {
    // The whole point of a running session is that it is already in hand server-side — resuming
    // is just navigating there, not another start/resume network round trip.
    router.push('/activities/write-acceptance-criteria/play');
  }

  async function handleAbandon() {
    // Confirmation lives in ResumeOrAbandonPrompt — onAbandon only fires after the student has
    // already confirmed, so this is just the actual abandon call.
    const session = current?.session;
    if (!token || !session || abandoning) return;

    setAbandoning(true);
    setError(null);

    const result = await abandonSession(token, session.session_id);

    setAbandoning(false);

    if (!result.ok) {
      if (result.status === 401) {
        router.push('/login');
        return;
      }
      // 409: the session already left in-progress by some other route (finished, or already
      // abandoned elsewhere) — treat it the same as a successful abandon rather than reporting
      // a conflict the student cannot act on.
      if (result.status === 409) {
        setCurrent(null);
        return;
      }
      setError({ message: result.error, needsProfile: false });
      return;
    }

    // The abandoned session's status just changed — the activity log's cached copy hasn't.
    if (profile?.user_id) {
      void loadActivityLog(token, profile.user_id, { forceRefresh: true });
    }
    setCurrent(null);
  }

  const session = current?.session ?? null;
  const totalStories = current?.stories.length ?? STORIES_PER_SESSION;
  const answeredCount = current?.answeredCount ?? 0;

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-lg">
        <Link
          href="/activities"
          className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy"
        >
          ← Back to Activities
        </Link>

        {isLoading ? (
          <ActivityDetailSkeleton />
        ) : (
          <>
            <div className="rounded-brand-lg border border-brand-navy-border bg-brand-navy p-8 text-brand-ink">
              <div className="mb-4 flex flex-wrap gap-2">
                {/* This activity has no difficulty progression (CLAUDE.md's "half-connected
                    worlds" note on write-acceptance-criteria) — every session is level 1, so this
                    badge is the same fixed "Easy · Level 1" app/activities/[slug]/page.tsx shows
                    a level-1 student, just without a live displayLevel to read from. */}
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold text-brand-green">
                  Easy · Level 1
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-brand-ink-muted">
                  {ACTIVITY.category}
                </span>
              </div>
              <h2 className="mb-2 text-2xl font-extrabold text-white">{ACTIVITY.name}</h2>
              <p className="mb-6 text-sm font-semibold text-brand-ink-muted">{ACTIVITY.instructions}</p>

              {session ? (
                <ResumeOrAbandonPrompt
                  message="You have a session in progress."
                  progressLabel={`${answeredCount} / ${totalStories} answered`}
                  progressFraction={totalStories > 0 ? answeredCount / totalStories : 0}
                  resumeLabel="Continue"
                  onResume={handleResume}
                  onAbandon={handleAbandon}
                  abandoning={abandoning}
                  confirmMessage="Abandon this in-progress attempt? Your answers so far will be discarded."
                />
              ) : (
                <button
                  onClick={handleStart}
                  disabled={starting}
                  className="rounded-full bg-brand-purple px-6 py-3 text-sm font-extrabold text-white hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {starting ? 'Starting…' : 'Start'}
                </button>
              )}

              {error ? (
                <div className="mt-4 rounded-brand-md border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
                  {error.message}
                  {error.needsProfile ? (
                    <Link href="/profile" className="ml-1 underline hover:text-white">
                      Go to your profile
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {/* Level 1 is the only level this activity ever has, so unlike
                  app/activities/[slug]/page.tsx there's nothing to pick between — shown purely
                  for visual consistency with the other activity detail pages (see the badge
                  above). */}
              {!session ? (
                <LevelReplaySelector highestSelectableLevel={1} selectedLevel={1} onSelect={() => {}} disabled={starting} />
              ) : null}
            </div>

            <CompletedAttemptsTable attempts={attempts} showLevel={false} />
          </>
        )}
      </div>
    </AppShell>
  );
}
