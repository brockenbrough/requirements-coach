'use client';

import { useState } from 'react';

const COPIED_MESSAGE_MS = 2000;

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Copy-to-clipboard control for a course code — extracted from CreateCourseForm (GitHub #241)
 * so every screen that shows a code can reuse the same clipboard logic and "Copied!" timing
 * instead of each hand-rolling it.
 *
 * Two variants, sharing that same logic: `variant="button"` (default, unchanged from before) is
 * the labelled pill CreateCourseModal/DuplicateCourseModal's success screens and the course
 * detail page used; `variant="icon"` (GitHub #362 follow-up) is a small icon-only control meant
 * to sit directly beside a code inline — the course detail page's header uses it next to the code
 * itself, where a full-width labelled button would be out of place. Both swap to a checkmark for
 * COPIED_MESSAGE_MS; the icon variant additionally announces the copy through an aria-live region
 * (`sr-only`, no visible layout shift) since its confirmation is otherwise purely a small icon
 * swap that assistive tech wouldn't otherwise notice.
 */
export function CopyCodeButton({
  code,
  variant = 'button',
  ariaLabel = 'Copy code',
}: {
  code: string;
  variant?: 'button' | 'icon';
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setError('');
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_MESSAGE_MS);
    } catch {
      setError('Could not copy automatically — please copy the code manually.');
    }
  }

  if (variant === 'icon') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleCopy}
          aria-label={ariaLabel}
          title={ariaLabel}
          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border transition ${
            copied
              ? 'border-brand-green/40 bg-brand-green/10 text-brand-green-dark'
              : 'border-gray-200 bg-white text-gray-400 hover:border-brand-purple hover:text-brand-purple'
          }`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? 'Copied to clipboard' : ''}
        </span>
        {error ? <span className="text-xs font-semibold text-brand-danger">{error}</span> : null}
      </span>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-2 rounded-full border border-brand-teal/40 bg-white px-4 py-2 text-sm font-extrabold text-brand-teal-dark transition hover:border-brand-teal"
      >
        {copied ? (
          <>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Copied!
          </>
        ) : (
          'Copy to clipboard'
        )}
      </button>
      {error ? <p className="mt-1.5 text-xs font-semibold text-brand-danger">{error}</p> : null}
    </div>
  );
}
