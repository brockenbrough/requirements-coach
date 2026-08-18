'use client';

import { useState } from 'react';
import { createQuiz, type CreatedQuiz } from '../lib/quizClient';
import type { GradingKind } from '../lib/activityTypes';
import { useModalDismiss } from './useModalDismiss';
import { RatingPromptModal } from './RatingPromptModal';

/**
 * GitHub #379: the two kinds of catalog an instructor can create. Rendered as radio cards rather
 * than a <select> on purpose — this is a two-way choice that decides what the catalog can ever
 * hold and cannot be changed afterwards, so the trade-off belongs on screen rather than collapsed
 * behind a dropdown.
 */
const KIND_OPTIONS: { value: GradingKind; label: string; hint: string }[] = [
  {
    value: 'mcq',
    label: 'Multiple-Choice Quiz',
    hint: 'Students pick one of four answers. Scored automatically.',
  },
  {
    value: 'llm-graded',
    label: 'LLM-Graded Task',
    hint: 'Students write a free-text answer to a prompt. Scored 1-10 by your configured AI provider.',
  },
];

/**
 * The popup that creates a question catalog (GitHub #359 follow-up), replacing the permanently
 * visible inline form app/instructor/quizzes/page.tsx used to render below the list. The
 * overlay/panel/header/footer markup is still composed independently, per this project's modal
 * convention (CLAUDE.md's Styling Guidelines) — only the focus-trap/Escape/focus-return wiring is
 * shared, via useModalDismiss, with the structurally identical components/CreateQuizModal.tsx.
 *
 * "Catalog" here and "quiz" in the code (createQuiz, activity_type.quiz_name) are the same
 * concept — see CLAUDE.md's Question Catalogs section.
 *
 * No course field: a catalog has no course of its own — activity_type_course, the table that used
 * to require picking one here, is gone. A catalog is created owned only by its instructor and
 * becomes visible to students once composed into an assembled_quiz (GitHub #360,
 * app/instructor/assembled-quizzes/page.tsx) for a course.
 *
 * GitHub #379 follow-up: selecting "LLM-Graded Task" immediately opens RatingPromptModal
 * (mode="create") as a second, stacked popup — a catalog's grading rubric (activity_type.rating_prompt)
 * is required up front, same "cannot be skipped past" treatment gradingKind itself already gets.
 * Its onSave here is synchronous local state, not a network call (the catalog itself doesn't exist
 * yet); dismissing it any other way resets gradingKind back to unselected, via
 * RatingPromptModal's own onCancel contract. Once set, a summary line with an Edit button lets the
 * instructor revise it before submitting, using the same popup pre-filled via initialValue.
 */
export function CreateCatalogModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (quiz: CreatedQuiz) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Starts null with no pre-selection: "creation cannot proceed without this choice" only holds
  // if there is no kind the instructor can accept by simply not looking at the field.
  const [gradingKind, setGradingKind] = useState<GradingKind | null>(null);
  const [ratingPrompt, setRatingPrompt] = useState('');
  const [ratingPromptModalOpen, setRatingPromptModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLInputElement>({
    onClose,
    isBlocked: submitting || ratingPromptModalOpen,
  });

  const canSubmit =
    Boolean(name.trim()) &&
    gradingKind !== null &&
    (gradingKind !== 'llm-graded' || Boolean(ratingPrompt.trim())) &&
    !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');

    const result = await createQuiz(token, {
      name: name.trim(),
      gradingKind: gradingKind!,
      description: description.trim() || undefined,
      ratingPrompt: gradingKind === 'llm-graded' ? ratingPrompt.trim() : undefined,
    });

    setSubmitting(false);

    if (!result.ok) {
      // A 409 name collision (activity_type's unique key, GitHub #347) lands here with the
      // route's own message — shown in place, not closed, so the instructor can pick another name
      // without retyping the description.
      setError(result.error);
      return;
    }

    onCreated(result.data.quiz);
    requestClose();
  }

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-catalog-title"
        className="w-full max-w-md rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Question Catalogs</p>
            <h2 id="create-catalog-title" className="mt-1 text-xl font-extrabold text-white">
              Create Catalog
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Name
            <input
              ref={firstFieldRef}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Sprint Planning Basics"
              className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            />
          </label>

          <label className="mb-1.5 mt-4 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Description <span className="normal-case text-brand-ink-muted/70">(optional)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this catalog cover?"
              rows={3}
              className="mt-1.5 block w-full resize-none rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            />
          </label>

          <fieldset className="mt-4">
            <legend className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
              Activity type
            </legend>
            <div className="grid gap-2">
              {KIND_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-3 rounded-brand-md border px-3.5 py-3 transition ${
                    gradingKind === option.value
                      ? 'border-brand-purple bg-brand-purple/10'
                      : 'border-brand-navy-border bg-brand-navy-2 hover:border-brand-purple/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="gradingKind"
                    value={option.value}
                    checked={gradingKind === option.value}
                    onChange={() => {
                      setGradingKind(option.value);
                      if (option.value === 'llm-graded') setRatingPromptModalOpen(true);
                    }}
                    className="mt-0.5 h-4 w-4 flex-none accent-brand-purple"
                  />
                  <span className="block">
                    <span className="block text-sm font-extrabold text-brand-ink">{option.label}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-brand-ink-muted">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-brand-ink-muted/70">
              This cannot be changed after the catalog is created.
            </p>
          </fieldset>

          {gradingKind === 'llm-graded' ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-3">
              <p className="text-xs font-semibold text-brand-ink-muted">
                {ratingPrompt.trim() ? 'Grading rubric set.' : 'Grading rubric required.'}
              </p>
              <button
                type="button"
                onClick={() => setRatingPromptModalOpen(true)}
                className="flex-none rounded-brand-md border border-brand-navy-border bg-brand-navy px-3 py-1.5 text-xs font-extrabold text-brand-ink transition hover:border-brand-purple hover:text-brand-purple"
              >
                {ratingPrompt.trim() ? 'Edit' : 'Add'}
              </button>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-xs font-bold text-brand-danger">{error}</p> : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={requestClose}
              disabled={submitting}
              className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
    {ratingPromptModalOpen ? (
      <RatingPromptModal
        mode="create"
        initialValue={ratingPrompt}
        onCancel={() => {
          setRatingPromptModalOpen(false);
          setGradingKind(null);
          setRatingPrompt('');
        }}
        onSave={async (value) => {
          setRatingPrompt(value);
          setRatingPromptModalOpen(false);
          return { ok: true };
        }}
      />
    ) : null}
    </>
  );
}
