'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { AcceptanceCriteriaFeedbackScreen } from '../../../components/AcceptanceCriteriaFeedbackScreen';
import { AcceptanceCriteriaWritingScreen } from '../../../components/AcceptanceCriteriaWritingScreen';
import { AcceptanceCriteriaWritingScreenSkeleton } from '../../../components/AcceptanceCriteriaWritingScreenSkeleton';
import { loadUserStory, submitAcceptanceCriteria } from '../../../lib/acceptanceCriteriaClient';
import type { AcceptanceCriteriaResult, UserStoryPrompt } from '../../../lib/acceptanceCriteriaTypes';
import { useRequireRole } from '../../../lib/useRequireRole';

export default function WriteAcceptanceCriteriaPage() {
  // Student-only, same as every other activity page (GitHub #82) — an instructor has no
  // "take the activity" capability.
  const { token, loading, authorized } = useRequireRole('student');

  const [userStory, setUserStory] = useState<UserStoryPrompt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [outcome, setOutcome] = useState<AcceptanceCriteriaResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastAttemptedText, setLastAttemptedText] = useState<string | null>(null);

  // loadAttempt doubles as "fetch a fresh prompt" — bumped both by the failed-load Retry
  // button and by "Write another" once feedback has been shown.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setIsLoading(true);
    setLoadFailed(false);
    setOutcome(null);
    setSubmitError(null);

    loadUserStory(token).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        setLoadFailed(true);
        setIsLoading(false);
        return;
      }

      setUserStory(result.data);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, loadAttempt]);

  if (loading || !authorized) return null;

  async function handleSubmit(text: string) {
    if (!token || !userStory || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    setLastAttemptedText(text);

    const result = await submitAcceptanceCriteria(token, userStory.userStoryId, text);
    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setOutcome(result.data);
  }

  function handleRetrySubmit() {
    if (lastAttemptedText !== null) void handleSubmit(lastAttemptedText);
  }

  function handleWriteAnother() {
    setLoadAttempt((count) => count + 1);
  }

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-xl">
        <Link href="/activities" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy">
          ← Back to Activities
        </Link>

        <h3 className="mb-5 text-lg font-extrabold">Write Acceptance Criteria</h3>

        {isLoading ? (
          <AcceptanceCriteriaWritingScreenSkeleton />
        ) : loadFailed ? (
          <div className="rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load a writing prompt.</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((count) => count + 1)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : userStory ? (
          outcome ? (
            <>
              <AcceptanceCriteriaFeedbackScreen userStory={userStory} result={outcome} />
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={handleWriteAnother}
                  className="rounded-full bg-brand-purple px-6 py-3 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
                >
                  Write another →
                </button>
              </div>
            </>
          ) : (
            <>
              <AcceptanceCriteriaWritingScreen key={userStory.userStoryId} userStory={userStory} submitting={submitting} onSubmit={handleSubmit} />
              {submitError ? (
                <div className="mt-4 rounded-brand-md border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger">
                  {submitError}
                  <button type="button" onClick={handleRetrySubmit} className="ml-2 underline hover:text-white">
                    Retry
                  </button>
                </div>
              ) : null}
            </>
          )
        ) : null}
      </div>
    </AppShell>
  );
}
