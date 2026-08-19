'use client';

import { useState } from 'react';
import { formatStoryAsMarkdown } from '../lib/storyMarkdown';

const COPIED_MESSAGE_MS = 2000;

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
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
 * GitHub #262: shared story display for both phases of Write Acceptance Criteria — replaces
 * the single `<p>{userStory.description}</p>` line each screen used to render inline.
 *
 * The writing screen (AcceptanceCriteriaWritingScreen) passes only `description`, since the
 * story genuinely has no acceptance criteria yet at that point — writing them is the student's
 * task, not a property of the story. The feedback screen (AcceptanceCriteriaFeedbackScreen)
 * additionally passes `acceptanceCriteria` (the student's own submitted text) as the third
 * section once it exists, rather than this component inventing or guessing at one.
 *
 * Title/Description/Acceptance Criteria use the same small-caps label style as "Your acceptance
 * criteria" above the textarea, so the card reads as distinct labeled fields rather than prose.
 *
 * `title` is the catalog's own name (ActivityDefinition.name), passed in by the caller — not
 * derived from the story text (see lib/storyMarkdown.ts's docblock for why that used to be
 * unreliable). It is the same for every story in a given quiz by construction, never a per-story
 * value, and there is nothing here for an instructor to separately maintain.
 */
export function StoryDisplayCard({
  title,
  description,
  acceptanceCriteria,
  className = '',
}: {
  title: string;
  description: string;
  /** The student's own written criteria — pass only once a submission exists. */
  acceptanceCriteria?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  const criteriaLines = (acceptanceCriteria ?? '')
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter((line) => line.length > 0);

  async function handleCopy() {
    const markdown = formatStoryAsMarkdown({ title, description, acceptanceCriteria });
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyError('');
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_MESSAGE_MS);
    } catch {
      setCopyError('Could not copy automatically — please copy the text manually.');
    }
  }

  return (
    <div className={`rounded-brand-lg border border-brand-navy-border bg-brand-navy p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">Title</span>
          <h3 className="text-base font-extrabold leading-snug text-white">{title}</h3>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-navy-border bg-brand-navy-2 px-3 py-1.5 text-xs font-extrabold text-brand-ink-muted transition hover:border-brand-purple hover:text-white"
        >
          {copied ? (
            <>
              <CheckIcon />
              Copied!
            </>
          ) : (
            <>
              <CopyIcon />
              Copy
            </>
          )}
        </button>
      </div>

      <div className="mt-4 border-t border-brand-navy-border pt-4">
        <span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">Description</span>
        <p className="text-sm leading-relaxed text-brand-ink">{description}</p>
      </div>

      {criteriaLines.length > 0 ? (
        <div className="mt-4 border-t border-brand-navy-border pt-4">
          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">Acceptance Criteria</span>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-brand-ink">
            {criteriaLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {copyError ? <p className="mt-2 text-xs font-semibold text-brand-danger">{copyError}</p> : null}
    </div>
  );
}
