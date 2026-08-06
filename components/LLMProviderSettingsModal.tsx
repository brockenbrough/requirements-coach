'use client';

import { useEffect, useRef } from 'react';
import { LLMProviderSettingsForm } from './LLMProviderSettingsForm';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const TITLE_ID = 'llm-provider-settings-title';

/**
 * GitHub #150: opened from the sidebar's gear icon (AppShell.tsx) for instructors — the primary
 * way to reach the LLM provider settings, replacing a dedicated-page navigation. Same
 * mount/unmount-is-open, focus-trap, Escape-to-close, backdrop-click-to-close, and
 * focus-return pattern as components/QuestionFormModal.tsx — copied rather than shared, the
 * same way QuestionFormModal and ImageCropModal each already implement this independently.
 *
 * Focus lands on the close button rather than the form's first field on open (QuestionFormModal's
 * convention): this form's fields render behind a loading skeleton until loadLlmConfig resolves,
 * so a field ref may not exist yet when this mounts — the close button always does.
 */
export function LLMProviderSettingsModal({ token, onClose }: { token: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
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
    onClose();
    previouslyFocusedRef.current?.focus();
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
        aria-labelledby={TITLE_ID}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-brand-lg bg-white p-7"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 id={TITLE_ID} className="text-xl font-extrabold text-brand-navy">
            LLM Provider Settings
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:text-brand-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <LLMProviderSettingsForm token={token} showHeading={false} />
      </div>
    </div>
  );
}
