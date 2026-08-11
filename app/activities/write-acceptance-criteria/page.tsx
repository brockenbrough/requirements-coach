'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { AcceptanceCriteriaFeedbackScreen } from '../../../components/AcceptanceCriteriaFeedbackScreen';
import { AcceptanceCriteriaWritingScreen } from '../../../components/AcceptanceCriteriaWritingScreen';
import { AcceptanceCriteriaWritingScreenSkeleton } from '../../../components/AcceptanceCriteriaWritingScreenSkeleton';
import { ResumeOrAbandonPrompt } from '../../../components/ResumeOrAbandonPrompt';
import { drawSessionStories, submitAcceptanceCriteria } from '../../../lib/acceptanceCriteriaClient';
import type { AcceptanceCriteriaResult, UserStoryPrompt } from '../../../lib/acceptanceCriteriaTypes';
import {
  answeredCount,
  clearSession,
  getInProgressSession,
  isSessionComplete,
  nextStoryIndex,
  recordStoryResult,
  startNewSession,
  STORIES_PER_SESSION,
  type AcceptanceCriteriaSession,
} from '../../../lib/acceptanceCriteriaSessionStore';
import { useRequireRole } from '../../../lib/useRequireRole';

type Outcome = { userStory: UserStoryPrompt; result: AcceptanceCriteriaResult };

export default function WriteAcceptanceCriteriaPage() {
  // Student-only, same as every other activity page (GitHub #82) — an instructor has no
  // "take the activity" capability.
  const { token, loading, authorized } = useRequireRole('student');
  const router = useRouter();

  const [session, setSession] = useState<AcceptanceCriteriaSession | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastAttemptedText, setLastAttemptedText] = useState<string | null>(null);

  // GitHub #260: mirrors the Type A start/resume flow (app/activities/[slug]/page.tsx) — on
  // mount, an in-progress local session (lib/acceptanceCriteriaSessionStore.ts) wins over
  // starting fresh. loadAttempt doubles as "start a brand-new session", bumped by the
  // failed-draw Retry button and by handleAbandon (after it clears the old session first, so
  // the re-run below finds nothing in progress and draws a new one).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const existing = getInProgressSession();
    if (existing) {
      setSession(existing);
      setShowPrompt(true);
      setOutcome(null);
      setSubmitError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    setLoadFailed(false);
    setShowPrompt(false);
    setOutcome(null);
    setSubmitError(null);

    drawSessionStories(token, STORIES_PER_SESSION).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        setLoadFailed(true);
        setIsLoading(false);
        return;
      }

      setSession(startNewSession(result.data));
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, loadAttempt]);

  if (loading || !authorized) return null;

  function handleResume() {
    setShowPrompt(false);
  }

  function handleAbandon() {
    clearSession();
    setSession(null);
    setShowPrompt(false);
    setLoadAttempt((count) => count + 1);
  }

  async function handleSubmit(text: string) {
    if (!token || !session || submitting) return;
    const slot = session.stories[nextStoryIndex(session)];
    if (!slot) return;

    setSubmitting(true);
    setSubmitError(null);
    setLastAttemptedText(text);

    const result = await submitAcceptanceCriteria(token, slot.userStoryId, text);
    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    const updated = recordStoryResult(session, slot.userStoryId, result.data);
    setSession(updated);
    setOutcome({ userStory: { userStoryId: slot.userStoryId, description: slot.description }, result: result.data });
  }

  function handleRetrySubmit() {
    if (lastAttemptedText !== null) void handleSubmit(lastAttemptedText);
  }

  function handleContinue() {
    if (!session) return;
    if (isSessionComplete(session)) {
      clearSession();
      router.push('/activities');
      return;
    }
    setOutcome(null);
  }

  const pendingSlot = session ? session.stories[nextStoryIndex(session)] : undefined;
  const currentUserStory: UserStoryPrompt | null = outcome
    ? outcome.userStory
    : pendingSlot
      ? { userStoryId: pendingSlot.userStoryId, description: pendingSlot.description }
      : null;
  const currentIndex = session && currentUserStory
    ? session.stories.findIndex((story) => story.userStoryId === currentUserStory.userStoryId)
    : -1;
  const storyPosition = currentIndex >= 0 ? currentIndex + 1 : 0;
  const isLastStory = session ? currentIndex === session.stories.length - 1 : false;

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-xl">
        <Link href="/activities" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy">
          ← Back to Activities
        </Link>

        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Write Acceptance Criteria</h3>
          {!isLoading && !loadFailed && !showPrompt && session ? (
            <span className="text-sm font-extrabold text-gray-500">
              Story {storyPosition} of {STORIES_PER_SESSION}
            </span>
          ) : null}
        </div>

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
        ) : showPrompt && session ? (
          <div className="rounded-brand-lg border border-brand-navy-border bg-brand-navy p-6">
            <ResumeOrAbandonPrompt
              message="You have a session in progress."
              progressLabel={`${answeredCount(session)} / ${STORIES_PER_SESSION} answered`}
              progressFraction={answeredCount(session) / STORIES_PER_SESSION}
              resumeLabel="Continue"
              onResume={handleResume}
              abandonLabel="Abandon"
              onAbandon={handleAbandon}
              confirmMessage="Are you sure you want to abandon this session? Your current answers will be lost."
            />
          </div>
        ) : currentUserStory ? (
          outcome ? (
            <>
              <AcceptanceCriteriaFeedbackScreen userStory={outcome.userStory} result={outcome.result} />
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={handleContinue}
                  className="rounded-full bg-brand-purple px-6 py-3 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
                >
                  {isLastStory ? 'Finish' : 'Next story →'}
                </button>
              </div>
            </>
          ) : (
            <>
              <AcceptanceCriteriaWritingScreen key={currentUserStory.userStoryId} userStory={currentUserStory} submitting={submitting} onSubmit={handleSubmit} />
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
