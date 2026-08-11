'use client';

import { useState } from 'react';
import type { InstructorACSubmission } from '../lib/acceptanceCriteriaClient';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** llmScore is out of 10 — bands mirror the app's usual high/medium/low thresholds (>=80%/50-79%/<50%), just scaled to /10 instead of /100. */
function scoreBadgeClasses(llmScore: number): string {
  const pct = llmScore * 10;
  if (pct >= 80) return 'bg-brand-teal/20 text-brand-teal-dark';
  if (pct >= 50) return 'bg-brand-gold/25 text-brand-gold-dark';
  return 'bg-brand-danger/15 text-brand-danger';
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * GitHub #226: restyled to match the dark navy table look ActivityLogRow already established
 * (components/ActivityLogRow.tsx) — kept as its own component rather than folded into
 * ActivityLogRow, since an AC submission's columns (User Story text, a /10 LLM score, an
 * expandable feedback panel) don't map onto ActivityLogEntry's shape (activity/level/status),
 * which ActivityLogRow is built around. Same visual language, different data.
 */
export function AcceptanceCriteriaSubmissionRow({
  submission,
  showStudent,
}: {
  submission: InstructorACSubmission;
  showStudent: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const colSpan = showStudent ? 5 : 4;

  return (
    <>
      <tr className="group border-t border-brand-navy-border bg-brand-navy-2 transition-colors duration-150 hover:bg-gray-50">
        {showStudent && (
          <td className="whitespace-nowrap px-4 py-3.5 font-bold text-brand-ink transition-colors duration-150 group-hover:text-brand-navy">
            {submission.studentName}
          </td>
        )}
        <td
          className="max-w-xs px-4 py-3.5 text-sm text-brand-ink transition-colors duration-150 group-hover:text-brand-navy"
          title={submission.userStoryDescription}
        >
          {truncate(submission.userStoryDescription, 60)}
        </td>
        <td className="px-4 py-3.5">
          {submission.llmScore !== null ? (
            <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums ${scoreBadgeClasses(submission.llmScore)}`}>
              {submission.llmScore} / 10
            </span>
          ) : (
            <span className="inline-block whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold text-brand-ink-muted transition-colors duration-150 group-hover:bg-gray-200 group-hover:text-gray-600">
              Not graded
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3.5 text-sm text-brand-ink-muted transition-colors duration-150 group-hover:text-gray-500">
          {new Date(submission.submittedAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-3.5 text-right">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse submission' : 'Expand submission'}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-brand-navy-border text-brand-ink-muted transition-colors duration-150 group-hover:border-gray-300 group-hover:text-gray-500"
          >
            <ChevronIcon expanded={expanded} />
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-brand-navy-border bg-brand-navy-2">
          <td colSpan={colSpan} className="px-4 pb-5 pt-3">
            <div className="space-y-4 rounded-brand-md border border-brand-navy-border bg-brand-navy p-4">
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">User Story</p>
                <p className="text-sm leading-relaxed text-brand-ink">{submission.userStoryDescription}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">Submitted Acceptance Criteria</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-brand-ink">{submission.submittedText}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">LLM Feedback</p>
                {submission.llmFeedback ? (
                  <p className="text-sm leading-relaxed text-brand-ink">{submission.llmFeedback}</p>
                ) : (
                  <p className="text-sm italic text-brand-ink-muted">Not yet graded.</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
