'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { AcceptanceCriteriaFeedbackScreen } from '../../../../components/AcceptanceCriteriaFeedbackScreen';
import { AcceptanceCriteriaWritingScreen } from '../../../../components/AcceptanceCriteriaWritingScreen';
import { AcceptanceCriteriaWritingScreenSkeleton } from '../../../../components/AcceptanceCriteriaWritingScreenSkeleton';
import { SessionProgressDots, type ProgressDotStatus } from '../../../../components/SessionProgressDots';
import { SessionSummaryScreen, type SessionSummaryItem } from '../../../../components/SessionSummaryScreen';
import {
  type AcSessionStory,
  type CurrentAcSessionResult,
  loadCurrentAcceptanceCriteriaSession,
  submitAcceptanceCriteria,
} from '../../../../lib/acceptanceCriteriaClient';
import { AC_PASS_SCORE, STORIES_PER_SESSION } from '../../../../lib/acceptanceCriteriaRules';
import type { AcceptanceCriteriaResult } from '../../../../lib/acceptanceCriteriaTypes';
import { loadActivityLog, loadCompletedAttempts } from '../../../../lib/sessionClient';
import { deriveStoryTitle } from '../../../../lib/storyMarkdown';
import { useRequireRole } from '../../../../lib/useRequireRole';

/** What the last submitted story earned, alongside the feedback for it. */
type Outcome = { userStory: AcSessionStory; result: AcceptanceCriteriaResult; completed: boolean };

export default function WriteAcceptanceCriteriaPlayPage() {
  const router = useRouter();
  // Also redirects an instructor account away (GitHub #82) — this page is the "activity
  // durchführen" flow itself, exactly what an instructor must not be able to reach.
  const { token, profile, loading, authorized } = useRequireRole('student');

  const [session, setSession] = useState<CurrentAcSessionResult | null>(null);
  const [nextPosition, setNextPosition] = useState<number | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastAttemptedText, setLastAttemptedText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The server is the only source of progress — there is no stored "current story", it is
   * derived from which of the drawn stories have a submission logged. So resuming, reloading,
   * and recovering from a double submit are all the same read.
   *
   * Mirrors PlayActivityPage's syncFromServer (GitHub #263): skipped while showSummary is true.
   * A finished session is no longer "current" server-side (GET .../sessions/current only ever
   * answers for an in-progress one), so re-syncing at that point would find session: null and
   * navigate away, discarding the summary before the student has dismissed it.
   */
  const syncFromServer = useCallback(async () => {
    if (!token || showSummary) return;

    const result = await loadCurrentAcceptanceCriteriaSession(token);

    if (!result.ok) {
      if (result.status === 401) {
        router.replace('/login');
        return;
      }
      setError(result.error);
      return;
    }

    // Nothing running: the student got here without starting, or already finished.
    if (!result.data.session) {
      router.replace('/activities/write-acceptance-criteria');
      return;
    }

    setSession(result.data);
    setNextPosition(result.data.nextPosition);
    setAnsweredCount(result.data.answeredCount);
    setOutcome(null);

    // All stories answered but session not formally completed yet (e.g. LLM error interrupted
    // the last submission before completeAcSession ran). Show summary instead of blank page.
    if (result.data.nextPosition === null) {
      setShowSummary(true);
    }
  }, [token, router, showSummary]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  if (loading || !authorized) return null;

  if (error) {
    return (
      <AppShell active="activities">
        <div className="mx-auto max-w-xl rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-sm font-semibold text-brand-danger-light">
          {error}
          <Link href="/activities/write-acceptance-criteria" className="ml-1 underline hover:text-white">
            Back to the activity
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!session?.session) {
    return (
      <AppShell active="activities">
        <div className="mx-auto max-w-xl">
          <AcceptanceCriteriaWritingScreenSkeleton />
        </div>
      </AppShell>
    );
  }

  const stories = session.stories;
  const currentStory = outcome
    ? outcome.userStory
    : stories.find((story) => story.position === nextPosition);

  async function handleSubmit(text: string) {
    if (!token || !session?.session || submitting || !currentStory) return;

    setSubmitting(true);
    setSubmitError(null);
    setLastAttemptedText(text);

    const result = await submitAcceptanceCriteria(token, session.session.session_id, currentStory.userStoryId, text);
    setSubmitting(false);

    if (!result.ok) {
      // Already submitted or out of order — another tab/device got there first. The server's
      // version wins, so re-read instead of reporting a conflict the student cannot act on.
      if (result.status === 409) {
        void syncFromServer();
        return;
      }
      if (result.status === 401) {
        router.replace('/login');
        return;
      }
      setSubmitError(result.error);
      return;
    }

    // The activity log's answeredCount for this session is now stale, whether or not this was
    // the final story — refresh regardless of handleFinishSummary's own refresh, which only
    // fires once the whole session is done.
    if (profile?.user_id) {
      void loadActivityLog(token, profile.user_id, { forceRefresh: true });
    }

    setSession((current) => (current ? { ...current, session: result.data.session } : current));
    setAnsweredCount(result.data.answeredCount);
    setNextPosition(result.data.nextPosition);
    setOutcome({
      userStory: currentStory,
      result: {
        submissionId: result.data.submissionId,
        submittedText: result.data.submittedText,
        score: result.data.score,
        feedback: result.data.feedback,
      },
      completed: result.data.completed,
    });
  }

  function handleRetrySubmit() {
    if (lastAttemptedText !== null) void handleSubmit(lastAttemptedText);
  }

  function handleContinue() {
    if (!outcome) return;

    // Fold the just-graded submission into session.submissions before dropping the feedback
    // view — same reasoning as PlayActivityPage's handleContinue (GitHub #236): the progress
    // dots and the summary both need this story's result once it stops being "current".
    setSession((current) =>
      current
        ? {
            ...current,
            submissions: [
              ...current.submissions,
              {
                submissionId: outcome.result.submissionId,
                userStoryId: outcome.userStory.userStoryId,
                submittedText: outcome.result.submittedText,
                score: outcome.result.score,
                feedback: outcome.result.feedback,
                submittedAt: new Date().toISOString(),
                gradedAt: new Date().toISOString(),
              },
            ],
          }
        : current,
    );

    if (outcome.completed) {
      // GitHub #263: show the session summary instead of navigating away immediately — the
      // cache refresh + navigation happens once the student dismisses it, in handleFinishSummary.
      setOutcome(null);
      setShowSummary(true);
      return;
    }

    setOutcome(null);
  }

  async function handleFinishSummary() {
    if (token && profile?.user_id) {
      // Await the refresh before navigating so the landing page's cache is already up to date
      // when it mounts — the same reasoning as PlayActivityPage's handleFinishSummary (GitHub #130).
      await Promise.all([
        loadCompletedAttempts(token, profile.user_id, 'WRITE_ACCEPTANCE_CRITERIA', { forceRefresh: true }),
        loadActivityLog(token, profile.user_id, { forceRefresh: true }),
      ]);
    }
    router.push('/activities/write-acceptance-criteria');
  }

  // Once the session is complete, currentStory legitimately becomes undefined (nextPosition is
  // null server-side, nothing left to draw) — expected while showSummary is up, not a "got here
  // without starting" case.
  if (!currentStory && !showSummary) return null;

  const orderedStories = [...stories].sort((a, b) => a.position - b.position);
  const submittedStoryIds = new Set(session.submissions.map((submission) => submission.userStoryId));
  const dotStatuses: ProgressDotStatus[] = orderedStories.map((story) => {
    if (nextPosition === null) return 'done';
    if (story.position === (currentStory?.position ?? -1)) return 'current';
    return submittedStoryIds.has(story.userStoryId) ? 'done' : 'upcoming';
  });

  const storyPosition = (currentStory?.position ?? 0) + 1;
  const isLastStory = currentStory?.position === STORIES_PER_SESSION - 1;
  const allStoriesComplete = nextPosition === null;

  // SessionSummaryScreen is generic (score/message/items) — this page maps its own LLM-graded,
  // 1-10-per-story session into that shape, the same division of responsibility as
  // PlayActivityPage does for the Type A quiz's points-and-correctness session.
  const summaryScore = session.session.cumulative_score;
  const summaryMax = session.session.max_score;
  const passedCount = session.submissions.filter((submission) => (submission.score ?? 0) >= AC_PASS_SCORE).length;
  const storyCount = session.submissions.length;
  const summaryMessage =
    storyCount === 0
      ? 'No stories were graded in this session.'
      : passedCount === storyCount
        ? `Great job — all ${storyCount} stories passed!`
        : passedCount === 0
          ? `Keep practicing — none of the ${storyCount} stories passed this time.`
          : `Nice progress — ${passedCount} of ${storyCount} stories passed.`;
  const summaryItems: SessionSummaryItem[] = orderedStories.map((story) => {
    const submission = session.submissions.find((s) => s.userStoryId === story.userStoryId);
    return {
      key: story.userStoryId,
      label: deriveStoryTitle(story.description),
      scoreLabel: submission ? `${submission.score} / 10` : '—',
      passed: (submission?.score ?? 0) >= AC_PASS_SCORE,
    };
  });

  return (
    <AppShell active="activities">
      <div className="mx-auto max-w-xl">
        {!showSummary ? (
          <div className="mb-5 flex items-center justify-between">
            <SessionProgressDots statuses={dotStatuses} />
            <span className="text-sm font-bold text-gray-500">
              {allStoriesComplete
                ? `${STORIES_PER_SESSION} of ${STORIES_PER_SESSION} complete`
                : `Story ${storyPosition} of ${STORIES_PER_SESSION}`}
            </span>
          </div>
        ) : null}

        {showSummary ? (
          <SessionSummaryScreen
            scoreValue={summaryScore}
            scoreMax={summaryMax}
            message={summaryMessage}
            items={summaryItems}
            onDone={handleFinishSummary}
          />
        ) : outcome ? (
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
        ) : currentStory ? (
          <>
            <AcceptanceCriteriaWritingScreen
              key={currentStory.userStoryId}
              userStory={currentStory}
              submitting={submitting}
              onSubmit={handleSubmit}
            />
            {submitError ? (
              <div className="mt-4 rounded-brand-md border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger">
                {submitError}
                <button type="button" onClick={handleRetrySubmit} className="ml-2 underline hover:text-white">
                  Retry
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
