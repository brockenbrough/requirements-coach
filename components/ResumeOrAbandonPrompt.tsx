'use client';

/**
 * GitHub #260: "you have an attempt in progress — continue or abandon it?" — extracted from
 * app/activities/[slug]/page.tsx's existing Type A resume/abandon card (REQ-PL-6.3, GitHub #20)
 * so the Write Acceptance Criteria activity (app/activities/write-acceptance-criteria/page.tsx)
 * can offer the same choice instead of a second, parallel implementation. Deliberately has no
 * outer card styling of its own (no border/background) — each caller already provides that
 * (Type A's existing dark panel vs. Write-AC's own rounded-brand-lg card), so this only owns the
 * message/progress bar/buttons that were actually duplicated.
 *
 * The abandon confirmation lives here rather than in each caller, since "confirm before you
 * lose your progress" is a property of the abandon *button*, not of either specific activity.
 */
export function ResumeOrAbandonPrompt({
  message,
  progressLabel,
  progressFraction,
  resumeLabel = 'Resume',
  onResume,
  abandonLabel = 'Abandon',
  onAbandon,
  abandoning = false,
  confirmMessage,
}: {
  message: string;
  progressLabel: string;
  /** 0–1; clamped, so a caller passing a raw ratio can't overflow the bar. */
  progressFraction: number;
  resumeLabel?: string;
  onResume: () => void;
  abandonLabel?: string;
  onAbandon: () => void;
  abandoning?: boolean;
  confirmMessage: string;
}) {
  function handleAbandonClick() {
    if (!confirm(confirmMessage)) return;
    onAbandon();
  }

  const widthPercent = Math.round(Math.min(1, Math.max(0, progressFraction)) * 100);

  return (
    <>
      <p className="mb-4 text-sm font-bold text-brand-gold">{message}</p>
      <div className="mb-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-navy-2">
          <span className="block h-full bg-brand-teal" style={{ width: `${widthPercent}%` }} />
        </div>
        <span className="whitespace-nowrap text-sm font-extrabold text-brand-ink-muted">{progressLabel}</span>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onResume}
          className="rounded-full bg-brand-purple px-6 py-3 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
        >
          {resumeLabel}
        </button>
        <button
          type="button"
          onClick={handleAbandonClick}
          disabled={abandoning}
          className="rounded-full border border-brand-danger/40 bg-brand-danger/10 px-6 py-3 text-sm font-extrabold text-brand-danger-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          {abandoning ? 'Abandoning…' : abandonLabel}
        </button>
      </div>
    </>
  );
}
