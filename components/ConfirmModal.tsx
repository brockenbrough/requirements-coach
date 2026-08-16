'use client';

import { useState } from 'react';
import { useModalDismiss } from './useModalDismiss';

/**
 * A generic destructive-action confirmation popup (GitHub #361), for the two new confirmations
 * that issue needs (remove a catalog from a quiz, delete a quiz) — extracted as one shared
 * component rather than a fourth hand-copy of DeleteCourseModal/DeleteQuestionModal's near
 * identical shape, now that a third and fourth near-identical "confirm before doing something
 * destructive" dialog were both needed at once. Reuses components/useModalDismiss.ts for the
 * overlay/focus-trap/Escape/focus-return wiring, same as every Create*Modal.
 *
 * `onConfirm` does the actual work and reports success/failure the same way QuestionFormModal's
 * `onSave` does — the modal owns submitting/error state around it, and only closes on success, so
 * a failed request leaves the dialog open with the error shown rather than silently doing nothing.
 * Initial focus lands on Cancel, not the destructive button, matching DeleteCourseModal's own
 * choice: Enter right after opening must not trigger the destructive action.
 */
export function ConfirmModal({
  kicker,
  title,
  message,
  confirmLabel,
  confirmingLabel,
  onClose,
  onConfirm,
}: {
  kicker: string;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  confirmingLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLButtonElement>({
    onClose,
    isBlocked: submitting,
  });

  async function handleConfirm() {
    if (submitting) return;

    setSubmitting(true);
    setError('');

    const result = await onConfirm();
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    requestClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="w-full max-w-md rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-danger">{kicker}</p>
            <h2 id="confirm-modal-title" className="mt-1 text-xl font-extrabold text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="text-sm font-semibold text-brand-ink-muted">{message}</div>

        {error ? <p className="mt-3 text-xs font-bold text-brand-danger">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={firstFieldRef}
            type="button"
            onClick={requestClose}
            disabled={submitting}
            className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-brand-md bg-brand-danger px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
