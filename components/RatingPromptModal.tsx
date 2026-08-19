'use client';

import { useState } from 'react';
import { useModalDismiss } from './useModalDismiss';

/**
 * The evaluating-prompt popup for an llm-graded catalog's grading rubric — used two ways:
 *
 * 1. `mode="create"`: `components/CreateCatalogModal.tsx` opens this the instant "LLM-Graded Task"
 *    is selected, a second, stacked modal rather than an inline field, so the rubric can't be
 *    skipped past without deliberately dismissing something. `onSave` there is synchronous (local
 *    form state only — the catalog itself isn't created until the parent's own submit); dismissing
 *    any other way (X, Escape, backdrop click, Cancel) calls `onCancel`, which resets the
 *    grading-kind choice back to unselected — the "creation cannot proceed without this choice"
 *    rule `gradingKind` itself already follows, applied one level down.
 * 2. `mode="edit"`: the catalog detail page (`app/instructor/quizzes/[activityType]/page.tsx`)
 *    opens this from its "Set rubric"/"Edit" button for an *existing* llm-graded catalog. `onSave`
 *    there is a real network call (`PATCH /api/instructor/quizzes/{activityType}`) and can fail,
 *    so — unlike the create flow — `onSave` is always awaited and any `{ ok: false, error }` it
 *    returns is shown inline without closing, the same contract `ConfirmModal`'s `onConfirm` uses.
 *    `onCancel` here is a plain dismissal with no side effect: an existing catalog's rubric isn't
 *    "unselected" by walking away from an edit.
 *
 * Success does **not** call `requestClose`/`onCancel` — the caller is responsible for flipping its
 * own open-state (and, for the edit flow, updating the catalog's stored rubric) once `onSave`
 * resolves `{ ok: true }`, which is what actually unmounts this modal. Calling `onCancel` on a
 * successful save would incorrectly run the create flow's "reset to unselected" side effect.
 *
 * `initialValue` lets either caller reopen this prefilled — the create flow's own "Edit" summary
 * once a rubric has already been entered, or the edit flow's current `rating_prompt` — rather than
 * losing what was already written.
 */
export function RatingPromptModal({
  mode,
  initialValue,
  onCancel,
  onSave,
}: {
  mode: 'create' | 'edit';
  initialValue: string;
  onCancel: () => void;
  onSave: (ratingPrompt: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [ratingPrompt, setRatingPrompt] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLTextAreaElement>({
    onClose: onCancel,
    isBlocked: submitting,
  });

  const canSave = Boolean(ratingPrompt.trim()) && !submitting;

  async function handleSave() {
    if (!canSave) return;

    setSubmitting(true);
    setError('');

    const result = await onSave(ratingPrompt.trim());

    if (!result.ok) {
      setSubmitting(false);
      setError(result.error);
      return;
    }
    // Success: the caller closes this (see the docblock above) — nothing further to do here.
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-prompt-modal-title"
        className="w-full max-w-2xl rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">LLM-Graded Task</p>
            <h2 id="rating-prompt-modal-title" className="mt-1 text-xl font-extrabold text-white">
              Evaluating Prompt
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

        <label className="block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
          Grading rubric
          <textarea
            ref={firstFieldRef}
            value={ratingPrompt}
            onChange={(event) => setRatingPrompt(event.target.value)}
            disabled={submitting}
            placeholder="How should the AI score a student's answer? Replaces the built-in generic rubric for this catalog."
            rows={14}
            className="mt-1.5 block w-full resize-y rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <p className="mt-1.5 text-xs font-semibold text-brand-ink-muted/70">
          {mode === 'create'
            ? 'Required for an LLM-graded catalog. You can revise it later from the catalog page.'
            : 'Takes effect for every submission graded after you save — past grades are unaffected.'}
        </p>

        {error ? <p className="mt-3 text-xs font-bold text-brand-danger">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save Rubric'}
          </button>
        </div>
      </div>
    </div>
  );
}
