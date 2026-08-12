'use client';

/**
 * GitHub #263: shown once every item in a session has been graded — distinct from a per-item
 * feedback screen (AcceptanceCriteriaFeedbackScreen, FeedbackCard) both in content (every
 * item's result at a glance, not one item's full write-up) and look (gold "session complete"
 * framing instead of a per-item pass/fail gradient), so a student can tell which screen they're
 * looking at without reading the heading.
 *
 * Generic on purpose (GitHub #263 follow-up): the Write Acceptance Criteria session (LLM score
 * out of 10 per story) and the Type A quiz session (points, correct/incorrect per question)
 * score on entirely different scales, so this component takes pre-formatted numbers and a
 * pre-built item list rather than either domain's own types — each caller (write-acceptance-
 * criteria/page.tsx, [slug]/play/page.tsx) maps its own session state into these props, the same
 * division of responsibility as SessionProgressDots (GitHub #261) and ResumeOrAbandonPrompt
 * (GitHub #260).
 */
export type SessionSummaryItem = {
  key: string;
  label: string;
  scoreLabel: string;
  passed: boolean;
};

export function SessionSummaryScreen({
  scoreValue,
  scoreMax,
  message,
  items,
  onDone,
  doneLabel = 'Back to Activities',
}: {
  scoreValue: number | string;
  scoreMax: number | string;
  message: string;
  items: SessionSummaryItem[];
  onDone: () => void;
  doneLabel?: string;
}) {
  return (
    <div className="rounded-brand-lg border border-brand-gold/40 bg-gradient-to-br from-brand-gold-dark to-brand-navy p-8 text-center">
      <span className="mb-2 block text-xs font-extrabold uppercase tracking-wide text-brand-gold">Session complete</span>

      <div className="text-5xl font-extrabold text-white">
        {scoreValue}
        <span className="text-2xl font-bold text-brand-ink-muted"> / {scoreMax}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-brand-ink-muted">{message}</p>

      <div className="mt-6 space-y-2 text-left">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-3 rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-3"
          >
            <span className="text-sm font-semibold text-brand-ink">{item.label}</span>
            <span className={`shrink-0 text-sm font-extrabold ${item.passed ? 'text-brand-green' : 'text-brand-ink-muted'}`}>
              {item.scoreLabel}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="mt-6 w-full rounded-brand-md bg-brand-purple py-3 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
      >
        {doneLabel}
      </button>
    </div>
  );
}
