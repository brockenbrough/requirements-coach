'use client';

import { useState } from 'react';

const COPIED_MESSAGE_MS = 2000;

/**
 * Copy-to-clipboard button for a course code — extracted from CreateCourseForm (GitHub #241)
 * so the course detail page's header can reuse the exact same behavior instead of a second
 * copy of the clipboard logic. Owns its own "Copied!" confirmation state; callers just render
 * the code text themselves however fits their layout.
 */
export function CopyCodeButton({ code }: { code: string }) {
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
