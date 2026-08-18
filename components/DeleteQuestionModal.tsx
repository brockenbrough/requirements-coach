'use client';

import { useEffect, useRef, useState } from 'react';
import { deleteQuestion, type QuestionDeleteImpact } from '../lib/sessionClient';
import type { CatalogQuestion } from '../lib/quizQuestionTypes';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * GitHub #359: the confirmation in front of deleting a question from a catalog. Same
 * mount-is-open modal convention as components/DeleteCourseModal.tsx (focus trap, Escape,
 * backdrop click, initial focus on Cancel rather than the destructive button) rather than a
 * native window.confirm() — this is the same "destructive action needs a styled, unmissable
 * warning" reasoning DeleteCourseModal's own header comment gives.
 *
 * DELETE /api/instructor/questions/{id} 409s the first attempt when the question has already been
 * used in a student session, with an `impact` payload describing what's at stake. That flips this
 * modal into a second, more explicit confirmation step (`impact` state below) — the instructor
 * still has to click through a second, clearly-worded button before the retry is sent with
 * `force: true`, which rewinds the affected students' scores server-side and deletes anyway.
 */
export function DeleteQuestionModal({
  question,
  token,
  onClose,
  onDeleted,
}: {
  question: CatalogQuestion;
  token: string;
  onClose: () => void;
  onDeleted: (questionId: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [impact, setImpact] = useState<QuestionDeleteImpact | null>(null);

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
    if (submitting) return;
    onClose();
    previouslyFocusedRef.current?.focus();
  }

  async function handleDelete() {
    if (submitting) return;

    setSubmitting(true);
    setError('');

    const result = await deleteQuestion(token, question.id, impact !== null);

    if (!result.ok) {
      setSubmitting(false);
      if (result.status === 409 && result.impact) {
        setImpact(result.impact);
        return;
      }
      setError(result.error);
      return;
    }

    onDeleted(question.id);
  }

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
        aria-labelledby="delete-question-title"
        className="w-full max-w-md rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-danger">Question Catalog</p>
            <h2 id="delete-question-title" className="mt-1 text-xl font-extrabold text-white">
              Delete Question
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
          Delete <span className="font-extrabold text-white">&ldquo;{question.questionText}&rdquo;</span>?
        </p>

        <p className="mt-3 text-sm font-semibold text-brand-ink-muted">
          This removes the question permanently. Every other catalog and its questions are unaffected.
        </p>

        {impact ? (
          <div className="mt-4 rounded-brand-md border border-brand-danger/40 bg-brand-danger/10 p-3">
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-danger">
              Already used by students
            </p>
            <p className="mt-1.5 text-sm font-semibold text-brand-ink">
              {impact.pointsAtRisk > 0 ? (
                <>
                  {impact.studentsAffectedCount} student{impact.studentsAffectedCount === 1 ? '' : 's'} already
                  answered this question, earning{' '}
                  <span className="font-extrabold text-white">{impact.pointsAtRisk} point{impact.pointsAtRisk === 1 ? '' : 's'}</span>{' '}
                  total. Deleting it will remove those points from their score.
                </>
              ) : (
                <>
                  This question is currently assigned to {impact.sessionsCount} in-progress session
                  {impact.sessionsCount === 1 ? '' : 's'}. Deleting it will remove it from{' '}
                  {impact.sessionsCount === 1 ? 'that session' : 'those sessions'}.
                </>
              )}
            </p>
            <p className="mt-1.5 text-xs font-semibold text-brand-ink-muted">This cannot be undone.</p>
          </div>
        ) : null}

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
            {submitting ? 'Deleting…' : impact ? 'Delete anyway' : 'Delete question'}
          </button>
        </div>
      </div>
    </div>
  );
}
