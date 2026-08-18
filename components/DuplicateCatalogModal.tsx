'use client';

import { useState } from 'react';
import { duplicateCatalog, type DuplicatedQuiz } from '../lib/quizClient';
import { useModalDismiss } from './useModalDismiss';

/**
 * GitHub #478: the popup behind an example catalog's "Duplicate" action — same
 * ask-for-a-name-then-submit shape as DuplicateCourseModal.tsx, minus that one's reveal-the-code
 * second phase: a duplicated catalog has nothing analogous to a join code to read back, so success
 * just closes the modal and hands the new catalog to the caller (a list row + toast on the browse
 * page, same timing CreateCatalogModal's onCreated already uses).
 *
 * Only the name is asked for — grading kind and every question/prompt are copied automatically
 * server-side (POST /api/instructor/quizzes/{activityType}/duplicate). The source catalog is only
 * ever read.
 */
export function DuplicateCatalogModal({
  catalog,
  token,
  onClose,
  onCreated,
}: {
  catalog: { activityType: string; name: string };
  token: string;
  onClose: () => void;
  onCreated: (quiz: DuplicatedQuiz) => void;
}) {
  const [name, setName] = useState(`${catalog.name} (Copy)`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLInputElement>({
    onClose,
    isBlocked: submitting,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError('');

    const result = await duplicateCatalog(token, catalog.activityType, { name: name.trim() });
    setSubmitting(false);

    if (!result.ok) {
      // A 409 name collision lands here with the route's own message — shown in place, not
      // closed, so the instructor can pick another name without retyping anything.
      setError(result.error);
      return;
    }

    onCreated(result.data.quiz);
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
        aria-labelledby="duplicate-catalog-title"
        className="w-full max-w-md rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Question Catalogs</p>
            <h2 id="duplicate-catalog-title" className="mt-1 text-xl font-extrabold text-white">
              Duplicate Catalog
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

        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Copy name
            <input
              ref={firstFieldRef}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            />
          </label>

          <p className="mt-3 text-xs font-semibold text-brand-ink-muted">
            Every question copies into your own catalog — "{catalog.name}" is left exactly as it is. You can edit
            or delete the copy freely afterward.
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
              type="submit"
              disabled={!name.trim() || submitting}
              className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Duplicating…' : 'Duplicate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
