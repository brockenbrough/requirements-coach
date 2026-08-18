'use client';

import { useEffect, useRef, useState } from 'react';
import { AnswerOptionField } from './AnswerOptionField';
import type { ActivityType } from '../lib/activityTypes';
import type { QuizQuestion } from '../lib/quizQuestionTypes';
// Shared with components/PromptFormModal.tsx — the two authoring forms must offer the same
// levels with the same labels, since they write to the same difficulty_level scale.
import { DIFFICULTY_OPTIONS as LEVEL_OPTIONS } from '../lib/difficultyLevels';

const OPTION_COUNT = 4;
const EMPTY_OPTIONS = Array.from({ length: OPTION_COUNT }, () => '');

type FormErrors = {
  questionText?: string;
  options?: string;
  correctOption?: string;
  explanation?: string;
};

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Popup form for both adding a question (GitHub #120) and editing an existing one
 * (GitHub #158) — one component instead of two near-identical ones, since the fields, layout,
 * and validation are exactly the same; only what's pre-filled and the copy on the save button
 * differ by `mode`. Mounted/unmounted by the parent (the same pattern ImageCropModal already
 * uses) rather than taking its own `isOpen` prop — existence on the page *is* "open", and a
 * remount is what re-seeds the form fields when a different question is opened for editing.
 *
 * Accessibility: focus moves into the form on mount and returns to whatever had focus before
 * (the triggering Edit/New Question button) on close; Escape closes; Tab is trapped inside the
 * panel while it's open, since this is a true modal — nothing behind it should be reachable by
 * keyboard.
 *
 * GitHub #464: a successful save only auto-closes in 'edit' mode. In 'add' mode the modal stays
 * open — each save is already a real, persisted write via onSave, so there is nothing to lose by
 * letting the instructor add another right away — and the form resets to a blank question (quiz/
 * level selection stays as-is, since a batch of questions usually shares both). addedQuestions
 * tracks this session's own saves so the instructor can see them without the catalog's real list
 * behind this modal's full-screen overlay.
 */
export function QuestionFormModal({
  mode,
  initialData,
  defaultQuizType,
  defaultLevel,
  quizOptions,
  onClose,
  onSave,
}: {
  mode: 'add' | 'edit';
  /** Required (and used to pre-fill every field) when mode is 'edit'; ignored otherwise. */
  initialData?: QuizQuestion;
  /** Which quiz's tab/filter the page currently has active — the starting value in 'add' mode. */
  defaultQuizType: ActivityType;
  /**
   * Which difficulty the page's level filter currently has active — the starting value in 'add'
   * mode (GitHub #417). A caller with no level filter, or one sitting on "All levels", omits it
   * and gets the old Level 1 default. Ignored in 'edit' mode, where the question's own level wins.
   */
  defaultLevel?: 1 | 2 | 3;
  /**
   * The choices the "Quiz" dropdown offers (GitHub #359). A catalog's detail page passes its own
   * single catalog here, effectively locking the field to "this catalog" without special-casing
   * the dropdown away entirely; a page that lets a question move between catalogs (like the
   * now-retired flat Question Bank did) would pass more than one.
   */
  quizOptions: { value: ActivityType; label: string }[];
  onClose: () => void;
  /** Async so a failed save can keep the modal open with an error instead of closing blindly. */
  onSave: (question: QuizQuestion) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [quizType, setQuizType] = useState<ActivityType>(initialData?.quizType ?? defaultQuizType);
  const [level, setLevel] = useState<1 | 2 | 3>(initialData?.level ?? defaultLevel ?? 1);
  const [questionText, setQuestionText] = useState(initialData?.questionText ?? '');
  const [optionTexts, setOptionTexts] = useState<string[]>(
    initialData ? initialData.answerOptions.map((option) => option.text) : EMPTY_OPTIONS,
  );
  const [correctIndex, setCorrectIndex] = useState<number | null>(
    initialData ? initialData.answerOptions.findIndex((option) => option.isCorrect) : null,
  );
  const [explanation, setExplanation] = useState(initialData?.explanation ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // GitHub #464: in 'add' mode, a successful save no longer closes the modal — an instructor
  // adding a batch of questions to a catalog shouldn't have to reopen it after every single one.
  // addedQuestions is this modal instance's own running list (cleared on close, not persisted —
  // the parent's `questions` state, updated via onSave below, is what actually persists each one)
  // so the instructor can see what they've already added without the list being hidden behind
  // this modal's own full-screen overlay.
  const [addedQuestions, setAddedQuestions] = useState<{ id: string; questionText: string; level: 1 | 2 | 3 }[]>([]);

  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const questionTextRef = useRef<HTMLTextAreaElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    onClose();
    previouslyFocusedRef.current?.focus();
  }

  /** Cancel/×/backdrop/Escape all route through here so an in-flight save can't be abandoned. */
  function requestClose() {
    if (isSaving) return;
    close();
  }

  function updateOptionText(index: number, value: string) {
    setOptionTexts((current) => current.map((text, i) => (i === index ? value : text)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    if (!questionText.trim()) nextErrors.questionText = 'Question text is required.';
    if (optionTexts.some((text) => !text.trim())) nextErrors.options = `All ${OPTION_COUNT} answer options must be filled in.`;
    if (correctIndex === null) nextErrors.correctOption = 'Select which answer option is correct.';
    if (!explanation.trim()) nextErrors.explanation = 'Explanation is required.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Editing keeps the question's id, and each option's id at its position, so the PATCH route
    // can update existing rows instead of treating every edit as a delete-and-recreate.
    const questionId = mode === 'edit' && initialData ? initialData.id : `q-${Date.now()}`;

    const question: QuizQuestion = {
      id: questionId,
      quizType,
      level,
      questionText: questionText.trim(),
      answerOptions: optionTexts.map((text, index) => ({
        id: mode === 'edit' && initialData?.answerOptions[index] ? initialData.answerOptions[index].id : `${questionId}-opt-${index}`,
        text: text.trim(),
        isCorrect: index === correctIndex,
      })),
      explanation: explanation.trim(),
    };

    setSubmitError(null);
    setIsSaving(true);
    const result = await onSave(question);
    setIsSaving(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    // Editing is a single, targeted action on one existing question — closing afterward is the
    // unsurprising behavior an edit form usually has. Adding is the repeated, batch-y flow #464
    // is about, so it stays open instead; see addedQuestions' own comment above.
    if (mode === 'edit') {
      close();
      return;
    }

    setAddedQuestions((current) => [...current, { id: questionId, questionText: question.questionText, level }]);
    setQuestionText('');
    setOptionTexts(EMPTY_OPTIONS);
    setCorrectIndex(null);
    setExplanation('');
    setErrors({});
    questionTextRef.current?.focus();
  }

  const isEdit = mode === 'edit';

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
        aria-labelledby="question-form-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Question Catalog</p>
            <h2 id="question-form-title" className="mt-1 text-xl font-extrabold text-white">
              {isEdit ? 'Edit Question' : 'Add a New Question'}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5">
          <label className="mb-4 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Quiz
            <select
              ref={firstFieldRef}
              value={quizType}
              onChange={(event) => setQuizType(event.target.value as ActivityType)}
              className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            >
              {quizOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="mb-4">
            <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">Difficulty Level</span>
            <div className="flex gap-2">
              {LEVEL_OPTIONS.map((option) => (
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
          </div>

          {mode === 'add' && addedQuestions.length > 0 ? (
            <div
              role="status"
              className="mb-4 rounded-brand-md border border-brand-teal/40 bg-brand-teal/10 p-3"
            >
              <p className="flex items-center gap-2 text-xs font-bold text-brand-teal-dark">
                <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-brand-teal text-brand-teal-ink">
                  <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                {addedQuestions.length} question{addedQuestions.length === 1 ? '' : 's'} added this session — keep going, or press Done below.
              </p>
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-xs font-semibold text-brand-ink-muted">
                {addedQuestions.map((added) => (
                  <li key={added.id} className="truncate">
                    · {added.questionText}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Question Prompt
            <textarea
              ref={questionTextRef}
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              rows={3}
              placeholder="e.g. Which of these options is the weakest?"
              className="mt-1.5 block w-full resize-y rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            />
          </label>
          {errors.questionText ? <p className="mb-4 text-xs font-bold text-brand-danger">{errors.questionText}</p> : <div className="mb-4" />}

          <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">Answer Options</span>
          {optionTexts.map((text, index) => (
            <AnswerOptionField
              key={index}
              index={index}
              text={text}
              isSelected={correctIndex === index}
              onTextChange={(value) => updateOptionText(index, value)}
              onSelect={() => setCorrectIndex(index)}
            />
          ))}
          {errors.options ? <p className="mb-1 text-xs font-bold text-brand-danger">{errors.options}</p> : null}
          {errors.correctOption ? <p className="mb-1 text-xs font-bold text-brand-danger">{errors.correctOption}</p> : null}
          <p className="mb-4 text-xs font-semibold text-brand-ink-muted">Select the radio button next to the correct answer.</p>

          <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Explanation (shown when a student answers incorrectly)
            <textarea
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              rows={3}
              placeholder="Explain why the correct option is the strongest answer…"
              className="mt-1.5 block w-full resize-y rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
            />
          </label>
          {errors.explanation ? <p className="mb-4 text-xs font-bold text-brand-danger">{errors.explanation}</p> : null}

          {submitError ? (
            <p className="mb-4 rounded-brand-md border border-brand-danger/40 bg-brand-danger/10 p-3 text-xs font-bold text-brand-danger-light">
              {submitError}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={requestClose}
              disabled={isSaving}
              className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:opacity-60"
            >
              {/* Once at least one question has been saved this session, "Cancel" would wrongly
                  imply it could be undone — every save so far is already a real, persisted write. */}
              {addedQuestions.length > 0 ? 'Done' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
