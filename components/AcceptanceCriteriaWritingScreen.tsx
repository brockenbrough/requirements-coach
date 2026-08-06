'use client';

import { useState } from 'react';
import type { UserStoryPrompt } from '../lib/acceptanceCriteriaTypes';

const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

/**
 * GitHub #149: the input phase of the "Write Acceptance Criteria" activity (REQ-FU-2) — the
 * free-text counterpart to QuestionCard. Submit is disabled while the textarea is blank (after
 * trimming whitespace-only input) or while a submission is already in flight, with the same
 * "Submitting…" label swap QuestionCard uses for the equivalent state.
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
    <form onSubmit={handleSubmit} className="rounded-brand-lg border border-brand-navy-border bg-brand-navy p-6">
      <span className="mb-2 inline-block rounded-full bg-white/10 px-2.5 py-1 text-xs font-extrabold text-brand-teal">
        {DIFFICULTY_LABEL[userStory.difficulty_level]} · Level {userStory.difficulty_level}
      </span>
      <p className="mb-5 text-base font-extrabold leading-snug text-white">{userStory.story_text}</p>

      <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted" htmlFor="acceptance-criteria-input">
        Your acceptance criteria
      </label>
      <textarea
        id="acceptance-criteria-input"
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={submitting}
        rows={8}
        placeholder="Given ..., when ..., then ..."
        className="block w-full resize-y rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm leading-relaxed text-brand-ink outline-none transition focus:border-brand-purple disabled:cursor-not-allowed disabled:opacity-60"
      />
      <p className="mb-5 mt-1.5 text-xs font-semibold text-brand-ink-muted">
        Write one or more Given/When/Then criteria. Aim for criteria that are specific, testable, and clearly connected to the story above.
      </p>

      <button
        type="submit"
        disabled={isBlank || submitting}
        className="w-full rounded-brand-md bg-brand-purple py-3 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  );
}
