'use client';

/**
 * GitHub #261: the position-in-session dot row, extracted from the size/color logic
 * app/activities/[slug]/play/page.tsx already had (GitHub #236) so
 * app/activities/write-acceptance-criteria/page.tsx can show the same visual pattern without a
 * second, parallel implementation.
 *
 * Type A can judge a dot "correct"/"incorrect" the moment it's answered; Write Acceptance
 * Criteria can't — grading is an LLM call with no immediate right/wrong, so a submitted story
 * only ever reaches "done" (filled, no verdict). Rather than a boolean prop toggling a
 * hard-coded pair of color branches, each dot's status is passed in already resolved — the
 * caller (which alone knows whether correctness applies) decides "correct"/"incorrect" vs.
 * "done" per item; this component only maps status to appearance.
 */
export type ProgressDotStatus = 'upcoming' | 'current' | 'done' | 'correct' | 'incorrect';

const DOT_CLASS: Record<ProgressDotStatus, string> = {
  upcoming: 'h-2 w-2 bg-brand-navy-border',
  current: 'h-3 w-3 bg-brand-purple',
  done: 'h-2 w-2 bg-brand-teal',
  correct: 'h-2 w-2 bg-brand-green',
  incorrect: 'h-2 w-2 bg-brand-danger',
};

export function SessionProgressDots({ statuses }: { statuses: ProgressDotStatus[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {statuses.map((status, i) => (
        <span key={i} className={`rounded-full transition-all duration-300 ${DOT_CLASS[status]}`} />
      ))}
    </div>
  );
}
