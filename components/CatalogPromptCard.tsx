'use client';

import { DIFFICULTY_LABEL } from '../lib/difficultyLevels';
import type { CatalogUserStory } from '../lib/llmActivityTypes';

/**
 * GitHub #379: one prompt row on an LLM-graded catalog's detail page — the counterpart to the
 * inline question markup on that same page.
 *
 * Extracted as a component where the question markup stayed inline, for one reason: the question
 * block is existing, working code and leaving it untouched is the cheapest guarantee that adding
 * the LLM-graded branch can't regress the MCQ one.
 *
 * There is no answer-options list and no explanation: an LLM-graded prompt is the whole item. The
 * grading rubric isn't a property of the catalog (or any one prompt) at all — it lives on
 * whichever assembled_quiz composes this catalog (assembled_quiz.rating_prompt), since a rubric
 * describes how a specific quiz wants answers graded, and the same catalog can be composed into
 * more than one quiz. This page never shows or edits it — that only happens in the "Grading
 * Rubric" section of the assembled-quiz detail page (app/instructor/assembled-quizzes/[quizId]/page.tsx).
 */
export function CatalogPromptCard({
  prompt,
  highlightLabel,
  editable,
  onEdit,
  onDelete,
}: {
  prompt: CatalogUserStory;
  /** Non-null right after this row was added or updated, matching the question list's behavior. */
  highlightLabel: string | null;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`rounded-brand-lg border bg-gray-50 p-5 transition ${
        highlightLabel ? 'border-brand-teal/50 ring-2 ring-brand-teal/30' : 'border-gray-100'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-gray-500">
            {DIFFICULTY_LABEL[prompt.level]} · Level {prompt.level}
          </span>
          {highlightLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/20 px-2.5 py-1 text-[11px] font-extrabold text-brand-teal-dark">
              {highlightLabel}
            </span>
          ) : null}
        </div>
        {editable ? (
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              aria-label="Edit this prompt"
              title="Edit this prompt"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-purple hover:text-brand-purple"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete this prompt"
              title="Delete this prompt"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-danger hover:text-brand-danger"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      <p className="whitespace-pre-wrap text-sm font-bold text-brand-navy">{prompt.storyText}</p>
    </div>
  );
}
