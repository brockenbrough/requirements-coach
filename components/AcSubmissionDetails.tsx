import type { AcSubmissionRow } from '../lib/activityLogTypes';
import { StoryDisplayCard } from './StoryDisplayCard';

/**
 * GitHub #276: the combined Instructor Dashboard's expanded-row detail for a Write Acceptance
 * Criteria submission. Reuses StoryDisplayCard (GitHub #262) exactly as the student's own
 * AcceptanceCriteriaFeedbackScreen does — the story's title/description plus the student's
 * submitted text as its third "Acceptance Criteria" section — so an instructor sees the same
 * three-section layout a student does, with the LLM's score and feedback added below.
 */
export function AcSubmissionDetails({ submission }: { submission: AcSubmissionRow }) {
  const graded = submission.status === 'completed';

  return (
    <div className="space-y-4">
      <StoryDisplayCard description={submission.userStoryDescription} acceptanceCriteria={submission.submittedText} />

      <div className="rounded-brand-md border border-brand-navy-border bg-brand-navy p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <strong className="text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">LLM Feedback</strong>
          {graded ? (
            <span className="whitespace-nowrap rounded-full bg-brand-gold/15 px-2.5 py-1 text-xs font-extrabold text-brand-gold">
              {submission.score} / {submission.maxScore}
            </span>
          ) : null}
        </div>
        {graded && submission.llmFeedback ? (
          <p className="text-sm leading-relaxed text-brand-ink">{submission.llmFeedback}</p>
        ) : (
          <p className="text-sm italic text-brand-ink-muted">Not yet graded.</p>
        )}
      </div>
    </div>
  );
}
