'use client';

import { useState } from 'react';
import { CopyCodeButton } from './CopyCodeButton';
import { createCourse, type CourseSummary } from '../lib/courseClient';
import { useModalDismiss } from './useModalDismiss';

/**
 * The popup that creates a course (GitHub #241 follow-up), replacing the permanently visible
 * inline form app/instructor/courses/page.tsx used to render below the list — same
 * button-plus-popup pattern components/CreateCatalogModal.tsx and CreateQuizModal.tsx use, and
 * the same useModalDismiss wiring for the overlay/focus-trap/Escape/focus-return behavior.
 *
 * Two-phase, not close-on-success like the other two Create*Modals: the whole reason this form
 * exists is to hand the instructor a code they still need to *read and copy* to share with
 * students, and a modal that closes itself (or a toast that auto-dismisses in a few seconds)
 * would race that. Success swaps the same panel to a "Course Created" view — name, the code
 * itself, and the existing CopyCodeButton (GitHub #241) — that stays open until the instructor
 * dismisses it deliberately (Done, Escape, backdrop click, or the close icon all behave
 * identically once created).
 *
 * `onCreated` fires the moment the API call succeeds, not when the modal is eventually dismissed:
 * app/instructor/courses/page.tsx's list must update immediately (so "the list updates" doesn't
 * depend on the instructor also closing the code screen), and Escape/backdrop-click while looking
 * at the code must not un-create the course from the page's own state.
 */
export function CreateCourseModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (course: CourseSummary) => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdCourse, setCreatedCourse] = useState<CourseSummary | null>(null);

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLInputElement>({
    onClose,
    isBlocked: submitting,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || submitting) return;

    setSubmitting(true);
    setError('');

    const result = await createCourse(token, name.trim());
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onCreated(result.data.course);
    setCreatedCourse(result.data.course);
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
        aria-labelledby="create-course-title"
        className="w-full max-w-md rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Courses</p>
            <h2 id="create-course-title" className="mt-1 text-xl font-extrabold text-white">
              {createdCourse ? 'Course Created' : 'Create Course'}
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

        {createdCourse ? (
          <>
            <div className="rounded-brand-lg border border-brand-navy-border bg-brand-navy-2 p-6 text-center">
              <p className="text-xs font-extrabold uppercase tracking-wide text-brand-teal">{createdCourse.name}</p>
              <p className="mt-2 text-4xl font-extrabold tracking-[0.2em] text-white">{createdCourse.code}</p>
              <p className="mt-1.5 text-xs font-semibold text-brand-ink-muted">
                Share this code with your students so they can join.
              </p>
              <div className="mt-4 flex justify-center">
                <CopyCodeButton code={createdCourse.code} />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
              Course name
              <input
                ref={firstFieldRef}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Software Requirements — Fall 2026"
                className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
              />
            </label>

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
                {submitting ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
