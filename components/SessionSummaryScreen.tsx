'use client';

import { deriveStoryTitle } from '../lib/storyMarkdown';
import { AC_PASS_SCORE, summarizeSession, type AcceptanceCriteriaSession } from '../lib/acceptanceCriteriaSessionStore';

/**
 * GitHub #263: shown once every story in the session has been submitted and graded — distinct
 * from AcceptanceCriteriaFeedbackScreen (which recaps one story's own criteria and feedback)
 * both in content (every story's score at a glance, not one story's full write-up) and look
 * (gold "session complete" framing instead of that screen's per-story teal/purple pass/fail
 * gradient), so a student can tell which screen they're looking at without reading the heading.
 *
 * Takes the whole session rather than a pre-computed total, per the issue's instruction to
 * derive this from the existing session state instead of tracking scores separately —
 * summarizeSession (lib/acceptanceCriteriaSessionStore.ts) does the aggregation.
 */
export function SessionSummaryScreen({
  session,
  onDone,
}: {
  session: AcceptanceCriteriaSession;
  onDone: () => void;
}) {
  const { totalScore, maxScore, passedCount, storyCount } = summarizeSession(session);

  const message =
    storyCount === 0
      ? 'No stories were graded in this session.'
      : passedCount === storyCount
        ? `Great job — all ${storyCount} stories passed!`
        : passedCount === 0
          ? `Keep practicing — none of the ${storyCount} stories passed this time.`
          : `Nice progress — ${passedCount} of ${storyCount} stories passed.`;

  return (
    <div className="rounded-brand-lg border border-brand-gold/40 bg-gradient-to-br from-brand-gold-dark to-brand-navy p-8 text-center">
      <span className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-brand-gold">Session complete</span>

      <div className="text-5xl font-extrabold text-white">
        {totalScore}
        <span className="text-2xl font-bold text-brand-ink-muted"> / {maxScore}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-brand-ink-muted">{message}</p>

      <div className="mt-6 space-y-2 text-left">
        {session.stories.map((story) => (
          <div
            key={story.userStoryId}
            className="flex items-center justify-between gap-3 rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-3"
          >
            <span className="text-sm font-semibold text-brand-ink">{deriveStoryTitle(story.description)}</span>
            <span
              className={`shrink-0 text-sm font-extrabold ${
                story.result && story.result.score >= AC_PASS_SCORE ? 'text-brand-green' : 'text-brand-ink-muted'
              }`}
            >
              {story.result ? `${story.result.score} / 10` : '—'}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="mt-6 w-full rounded-brand-md bg-brand-purple py-3 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
      >
        Back to Activities
      </button>
    </div>
  );
}
