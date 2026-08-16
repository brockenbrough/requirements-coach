'use client';

import { useState } from 'react';
import { useModalDismiss } from './useModalDismiss';
import { DIFFICULTY_OPTIONS } from '../lib/difficultyLevels';
import type { ActivityType } from '../lib/activityTypes';
import type { CatalogUserStory } from '../lib/llmActivityTypes';
import type { UserStoryDraft } from '../lib/llmActivityClient';

// user_story.story_text is `text`, so there is no database limit to enforce. This is a soft
// authoring guide, not a validation rule — the counter turns amber past it, nothing is blocked.
// It exists because the whole prompt is sent to the LLM on every submission, and a prompt several
// screens long costs tokens on every attempt by every student.
const SOFT_LENGTH_LIMIT = 600;

/**
 * GitHub #379: the add/edit form for a prompt in an LLM-graded catalog — the free-text
 * counterpart to components/QuestionFormModal.tsx.
 *
 * Mirrors that component's prop contract (mode/initialData/default+options/onClose/onSave) so the
 * catalog detail page drives both the same way, but uses components/useModalDismiss.ts for the
 * focus trap rather than QuestionFormModal's older hand-rolled copy — new modals follow the hook,
 * per CLAUDE.md's Styling Guidelines.
 *
 * `onSave` is async and reports failure rather than throwing, which is what lets a rejected save
 * (a 400 from the route, an expired session) leave the dialog open with the message shown instead
 * of discarding what the instructor typed.
 *
 * The catalog picker is rendered even when `catalogOptions` holds a single entry — the same
 * effectively-locked field QuestionFormModal's `quizOptions` produces on this page. It stays
 * visible rather than being hidden, so the form always says which catalog it is writing to.
 */
export function PromptFormModal({
  mode,
  initialData,
  defaultActivityType,
  catalogOptions,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  initialData?: CatalogUserStory;
  defaultActivityType: ActivityType;
  catalogOptions: { value: ActivityType; label: string }[];
  onClose: () => void;
  onSave: (prompt: UserStoryDraft) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [activityType, setActivityType] = useState<ActivityType>(initialData?.activityType ?? defaultActivityType);
  const [level, setLevel] = useState<1 | 2 | 3>(initialData?.level ?? 1);
  const [storyText, setStoryText] = useState(initialData?.storyText ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLTextAreaElement>({
    onClose,
    isBlocked: submitting,
  });

  const canSubmit = storyText.trim() !== '' && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');

    const result = await onSave({ storyText: storyText.trim(), activityType, difficultyLevel: level });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    requestClose();
  }

  return (
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
        aria-labelledby="prompt-form-title"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">LLM-Graded Task</p>
            <h2 id="prompt-form-title" className="mt-1 text-xl font-extrabold text-white">
              {mode === 'edit' ? 'Edit Prompt' : 'New Prompt'}
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
          <label className="mb-4 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Catalog
            <select
              value={activityType}
              onChange={(event) => setActivityType(event.target.value)}
              disabled={catalogOptions.length <= 1}
              className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple disabled:opacity-70"
            >
              {catalogOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-4">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
              Difficulty Level
            </span>
            <div className="flex gap-2">
              {DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLevel(option.value)}
                  aria-pressed={level === option.value}
                  className={`flex-1 rounded-brand-md border px-2.5 py-2 text-xs font-extrabold transition ${
                    level === option.value
                      ? 'border-brand-purple bg-brand-purple text-white'
                      : 'border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {/* Unlike the MCQ catalogs, this level is the whole pool selector for a round: a
                student on level N only ever sees prompts stored at level N. */}
            <p className="mt-1.5 text-xs font-semibold text-brand-ink-muted/70">
              Students see this prompt only in a round at this level.
            </p>
          </div>

          <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Prompt
            <textarea
              ref={firstFieldRef}
              value={storyText}
              onChange={(event) => setStoryText(event.target.value)}
              rows={5}
              placeholder="e.g. As a shopper, I want to save items to a wishlist, so that I can buy them later."
              className="mt-1.5 block w-full resize-y rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            />
          </label>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <p className="text-xs font-semibold text-brand-ink-muted/70">
              The student writes a free-text answer to this. Your configured AI provider scores it 1-10.
            </p>
            <span
              className={`flex-none text-xs font-bold ${
                storyText.length > SOFT_LENGTH_LIMIT ? 'text-brand-gold' : 'text-brand-ink-muted/70'
              }`}
            >
              {storyText.length}
            </span>
          </div>

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
              {submitting ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Add Prompt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
