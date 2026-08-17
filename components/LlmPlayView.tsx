'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from './AppShell';
import { AcceptanceCriteriaFeedbackScreen } from './AcceptanceCriteriaFeedbackScreen';
import { AcceptanceCriteriaWritingScreen } from './AcceptanceCriteriaWritingScreen';
import { AcceptanceCriteriaWritingScreenSkeleton } from './AcceptanceCriteriaWritingScreenSkeleton';
import { SessionProgressDots, type ProgressDotStatus } from './SessionProgressDots';
import { SessionSummaryScreen, type SessionSummaryItem } from './SessionSummaryScreen';
import {
  type LlmSessionStory,
  type CurrentLlmSessionResult,
  loadCurrentLlmSession,
  submitLlmAnswer,
} from '../lib/llmActivityClient';
import type { ActivityDefinition } from '../lib/activityContent';
import { PROMPT_PASS_SCORE } from '../lib/llmActivityRules';
import type { LlmGradingResult } from '../lib/llmActivityTypes';
import { clearCachedLeaderboard } from '../lib/leaderboardStore';
import { loadActivityLog, loadCompletedAttempts } from '../lib/sessionClient';
import { deriveStoryTitle } from '../lib/storyMarkdown';
import { useRequireRole } from '../lib/useRequireRole';
import { useUser } from './UserProvider';

/** What the last submitted story earned, alongside the feedback for it. */
type Outcome = { userStory: LlmSessionStory; result: LlmGradingResult; completed: boolean };

/**
 * GitHub #379: the play flow for any LLM-graded activity — free-text answer, LLM grading,
 * per-prompt feedback, session summary. Lifted almost verbatim out of the old
 * app/activities/write-acceptance-criteria/play/page.tsx, which was a static route hardcoded to
 * the one seeded activity; everything specific to it now arrives as `activity`.
 *
 * Rendered by app/activities/[slug]/play/page.tsx, which resolves the slug and branches on
 * activity.gradingKind. The MCQ flow lives in that same file, untouched.
 */
export function LlmPlayView({ activity }: { activity: ActivityDefinition }) {
  const router = useRouter();
  // Also redirects an instructor account away (GitHub #82) — this page is the "activity
  // durchführen" flow itself, exactly what an instructor must not be able to reach.
  const { token, profile, loading, authorized } = useRequireRole('student');
  const { refreshScore } = useUser();

  const [session, setSession] = useState<CurrentLlmSessionResult | null>(null);
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

    const result = await loadCurrentLlmSession(token, activity.activityType);

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
      router.replace(`/activities/${activity.slug}`);
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
  }, [token, router, showSummary, activity.activityType]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  if (loading || !authorized) return null;

  if (error) {
    return (
      <AppShell active="activities">
        <div className="mx-auto max-w-xl rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-sm font-semibold text-brand-danger-light">
          {error}
          <Link href={`/activities/${activity.slug}`} className="ml-1 underline hover:text-white">
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

    const result = await submitLlmAnswer(
      token,
      activity.activityType,
      session.session.session_id,
      currentStory.userStoryId,
      text,
    );
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
      //
      // GitHub #392: this used to omit refreshScore() entirely — an LLM-graded session finishing
      // never invalidated the cumulative-score cache (lib/scoreStore.ts), so the sidebar (and
      // everything else reading that cache) kept showing whatever was cached before this session,
      // including after a full app restart, since that cache is localStorage. The MCQ play flow
      // (app/activities/[slug]/play/page.tsx's own handleFinishSummary) already refreshed it
      // correctly; this brings the LLM-graded flow in line with the same call.
      await Promise.all([
        refreshScore(),
        loadCompletedAttempts(token, profile.user_id, activity.activityType, { forceRefresh: true }),
        loadActivityLog(token, profile.user_id, { forceRefresh: true }),
      ]);
    }
    // An LLM-graded session writes an ordinary session_log row too, so it counts toward the same
    // cumulative score every course leaderboard ranks by — the same reasoning as
    // PlayActivityPage's own handleFinishSummary, which already clears this cache. Missing here
    // until now, so the leaderboard kept showing the pre-session rank after an LLM-graded pass.
    clearCachedLeaderboard();
    router.push(`/activities/${activity.slug}`);
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
  // Against the session's own draw, not STORIES_PER_SESSION: a session that drew fewer prompts
  // than the constant would otherwise never reach "Finish" and strand the student on
  // "Next story →" with nothing left to answer.
  const storyTotal = orderedStories.length;
  const isLastStory = currentStory?.position === storyTotal - 1;
  const allStoriesComplete = nextPosition === null;

  // SessionSummaryScreen is generic (score/message/items) — this page maps its own LLM-graded,
  // 1-10-per-story session into that shape, the same division of responsibility as
  // PlayActivityPage does for the Type A quiz's points-and-correctness session.
  const summaryScore = session.session.cumulative_score;
  const summaryMax = session.session.max_score;
  const passedCount = session.submissions.filter((submission) => (submission.score ?? 0) >= PROMPT_PASS_SCORE).length;
  const storyCount = session.submissions.length;
  const summaryMessage =
    storyCount === 0
      ? 'No prompts were graded in this session.'
      : passedCount === storyCount
        ? `Great job — all ${storyCount} prompts passed!`
        : passedCount === 0
          ? `Keep practicing — none of the ${storyCount} prompts passed this time.`
          : `Nice progress — ${passedCount} of ${storyCount} prompts passed.`;
  const summaryItems: SessionSummaryItem[] = orderedStories.map((story) => {
    const submission = session.submissions.find((s) => s.userStoryId === story.userStoryId);
    return {
      key: story.userStoryId,
      label: deriveStoryTitle(story.description),
      scoreLabel: submission ? `${submission.score} / 10` : '—',
      passed: (submission?.score ?? 0) >= PROMPT_PASS_SCORE,
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
                ? `${storyTotal} of ${storyTotal} complete`
                : `Prompt ${storyPosition} of ${storyTotal}`}
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
