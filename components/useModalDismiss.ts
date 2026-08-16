'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The focus-trap / Escape-to-close / initial-focus / restore-focus-on-close behavior every popup
 * in this project repeats independently (QuestionFormModal, EditCourseModal, DeleteCourseModal,
 * DeleteQuestionModal) — factored out here once two structurally identical "create X" modals
 * (CreateCatalogModal, CreateQuizModal) needed the exact same wiring back to back. Deliberately
 * behavior only, not a JSX shell: this project's modals compose their own overlay/panel/header
 * markup independently (see CLAUDE.md's Styling Guidelines), and that stays true for these two as
 * well — only the a11y logic is shared, so the header/body/footer of each modal is still free to
 * differ (CreateQuizModal's has a course dropdown and a catalog checklist CreateCatalogModal has
 * no use for).
 *
 * `isBlocked` (a save in flight) suppresses Escape/backdrop dismissal exactly like every existing
 * modal's own hand-rolled guard already does — passed as a dependency of the keydown effect
 * (rather than only read inside a `[]`-effect closure, the mistake every one of those hand-rolled
 * copies makes) so a submit-in-flight starting *after* mount is still honored, not just its value
 * at the moment the modal opened.
 */
export function useModalDismiss<TPanel extends HTMLElement = HTMLDivElement, TFirstField extends HTMLElement = HTMLElement>({
  onClose,
  isBlocked = false,
}: {
  onClose: () => void;
  isBlocked?: boolean;
}) {
  const panelRef = useRef<TPanel>(null);
  const firstFieldRef = useRef<TFirstField>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose() {
    if (isBlocked) return;
    onClose();
    previouslyFocusedRef.current?.focus();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
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
  }, [isBlocked, onClose]);

  return { panelRef, firstFieldRef, requestClose };
}
