'use client';

import { useState } from 'react';
import type { UserStoryPrompt } from '../lib/llmActivityTypes';
import { StoryDisplayCard } from './StoryDisplayCard';

/**
 * GitHub #149: the input phase of the "Write Acceptance Criteria" activity (REQ-FU-2) — the
 * free-text counterpart to QuestionCard. Submit is disabled while the textarea is blank (after
 * trimming whitespace-only input) or while a submission is already in flight, with the same
 * "Submitting…" label swap QuestionCard uses for the equivalent state.
 *
 * GitHub #262: the story itself now renders via StoryDisplayCard as its own card, separate from
 * this form — the story isn't part of what the student is filling in, so it shouldn't share a
 * card with the input.
 */
export function AcceptanceCriteriaWritingScreen({
  userStory,
  submitting = false,
  onSubmit,
}: {
  userStory: UserStoryPrompt;
  submitting?: boolean;
  onSubmit: (submittedText: string) => void;
}) {
  const [text, setText] = useState('');
  const isBlank = text.trim().length === 0;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isBlank || submitting) return;
    onSubmit(text.trim());
  }

  return (
    <>
      <StoryDisplayCard description={userStory.description} className="mb-5" />

      <form onSubmit={handleSubmit} className="rounded-brand-lg border border-brand-navy-border bg-brand-navy p-6">
        <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted" htmlFor="acceptance-criteria-input">
          Your answer
        </label>
        <textarea
          id="acceptance-criteria-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={submitting}
          rows={8}
          className="mb-5 block w-full resize-y rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm leading-relaxed text-brand-ink outline-none transition focus:border-brand-purple disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={isBlank || submitting}
          className="w-full rounded-brand-md bg-brand-purple py-3 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </form>
    </>
  );
}
