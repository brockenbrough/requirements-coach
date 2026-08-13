'use client';

import { useEffect, useRef, useState } from 'react';
import { deleteCourse, type CourseDetail } from '../lib/courseClient';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * GitHub #326: the confirmation in front of deleting a course. Structurally the same modal as
 * components/EditCourseModal.tsx — mount-is-open, focus trap, Escape to close, backdrop click to
 * close, focus returned on close — since that is the popup convention every dialog in this
 * project repeats independently rather than through a shared base component.
 *
 * Not a window.confirm() (which is what handleRemove on the same page still uses for removing a
 * single student): the acceptance criterion is that the dialog states the enrolled student count
 * *before* the instructor commits, and a native confirm can neither be styled to read as
 * destructive nor be trusted to survive a popup blocker.
 *
 * Two deliberate deviations from EditCourseModal:
 * - initial focus lands on Cancel, not on the destructive button, so Enter right after opening
 *   cannot delete a course;
 * - the confirm button is brand-danger rather than brand-purple, the only place on this page
 *   that colour is used for an action rather than an error message.
 *
 * The count comes from the roster the detail page already has in state, so opening this costs no
 * extra request. It can in principle be seconds stale (a student joining with the code in the
 * meantime); that's acceptable for a warning — the route re-counts server-side and returns the
 * number it actually unenrolled.
 */
export function DeleteCourseModal({
  course,
  token,
  onClose,
  onDeleted,
}: {
  course: CourseDetail;
  token: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const panelRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    // A delete in flight must not be dismissed out from under itself — the request would still
    // land, and the page would keep rendering a course that no longer exists.
    if (submitting) return;
    onClose();
    previouslyFocusedRef.current?.focus();
  }

  async function handleDelete() {
    if (submitting) return;

    setSubmitting(true);
    setError('');

    const result = await deleteCourse(token, course.id);

    if (!result.ok) {
      setSubmitting(false);
      setError(result.error);
      return;
    }

    // No setSubmitting(false) on success: onDeleted navigates away, and re-enabling the button
    // first would flash a live "Delete course" on a course that is already gone.
    onDeleted();
  }

  const studentCount = course.students.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-course-title"
        className="w-full max-w-md rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-danger">Courses</p>
            <h2 id="delete-course-title" className="mt-1 text-xl font-extrabold text-white">
              Delete Course
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p className="text-sm font-semibold text-brand-ink">
          Delete <span className="font-extrabold text-white">{course.name}</span>?
        </p>

        <p className="mt-3 text-sm font-semibold text-brand-ink-muted">
          {studentCount === 0 ? (
            'No students are enrolled.'
          ) : (
            <>
              <span className="font-extrabold text-brand-danger">
                {studentCount} student{studentCount === 1 ? '' : 's'} will be unenrolled.
              </span>{' '}
            </>
          )}
          The course, its join code and its CSV export are gone for good.
        </p>

        <p className="mt-3 text-sm font-semibold text-brand-ink-muted">
          Students keep their own attempt history and scores.
        </p>

        {error ? <p className="mt-3 text-xs font-bold text-brand-danger">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={close}
            disabled={submitting}
            className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="rounded-brand-md bg-brand-danger px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Deleting…' : 'Delete course'}
          </button>
        </div>
      </div>
    </div>
  );
}
