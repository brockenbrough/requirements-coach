'use client';

import { useState } from 'react';
import type { InstructorACSubmission } from '../lib/acceptanceCriteriaClient';

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

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
      <tr className="border-t border-gray-100 hover:bg-gray-50">
        {showStudent && (
          <td className="px-4 py-2.5 text-sm font-semibold text-brand-navy">
            {submission.studentName}
          </td>
        )}
        <td className="max-w-xs px-4 py-2.5 text-sm text-gray-600" title={submission.userStoryDescription}>
          {truncate(submission.userStoryDescription, 60)}
        </td>
        <td className="px-4 py-2.5 text-sm tabular-nums">
          {submission.llmScore !== null ? (
            <span className="font-bold text-brand-navy">{submission.llmScore} / 10</span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
              Not graded
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-500">
          {new Date(submission.submittedAt).toLocaleDateString()}
        </td>
        <td className="px-4 py-2.5 text-right">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-bold text-brand-purple hover:underline"
          >
            {expanded ? '▲ Collapse' : '▼ Expand'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-gray-100 bg-gray-50">
          <td colSpan={colSpan} className="px-4 pb-5 pt-3">
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-gray-400">User Story</p>
                <p className="text-sm font-semibold text-gray-700">{submission.userStoryDescription}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-gray-400">Submitted Text</p>
                <p className="whitespace-pre-wrap text-sm text-gray-700">{submission.submittedText}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-gray-400">LLM Feedback</p>
                {submission.llmFeedback ? (
                  <p className="text-sm text-gray-700">{submission.llmFeedback}</p>
                ) : (
                  <p className="text-sm italic text-gray-400">Not yet graded.</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
