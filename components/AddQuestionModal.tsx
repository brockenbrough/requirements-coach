'use client';

import { useEffect, useRef, useState } from 'react';
import { AnswerOptionField } from './AnswerOptionField';
import type { ActivityType } from '../lib/activityTypes';
import type { QuizQuestion } from '../lib/quizQuestionTypes';

const QUIZ_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'IDENTIFY_WEAK_USER_STORIES', label: 'Identify Weak User Stories' },
  { value: 'IDENTIFY_WEAK_ACCEPTANCE_CRITERIA', label: 'Identify Weak Acceptance Criteria' },
];

const LEVEL_OPTIONS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Easy · Level 1' },
  { value: 2, label: 'Medium · Level 2' },
  { value: 3, label: 'Hard · Level 3' },
];

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
 * Popup form for adding a question to an existing quiz (GitHub #120). Mounted/unmounted by the
 * parent (`{showAddModal ? <AddQuestionModal .../> : null}`, the same pattern ImageCropModal
 * already uses) rather than taking its own `isOpen` prop — existence on the page *is* "open".
 *
 * Accessibility: focus moves into the form on mount and returns to whatever had focus before
 * (the "New Question" button) on close; Escape closes; Tab is trapped inside the panel while
 * it's open, since this is a true modal — nothing behind it should be reachable by keyboard.
 */
export function AddQuestionModal({
  defaultQuizType,
  onClose,
  onSave,
}: {
  defaultQuizType: ActivityType;
  onClose: () => void;
  onSave: (question: QuizQuestion) => void;
}) {
  const [quizType, setQuizType] = useState<ActivityType>(defaultQuizType);
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [questionText, setQuestionText] = useState('');
  const [optionTexts, setOptionTexts] = useState<string[]>(EMPTY_OPTIONS);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [explanation, setExplanation] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const panelRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
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

  function updateOptionText(index: number, value: string) {
    setOptionTexts((current) => current.map((text, i) => (i === index ? value : text)));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const nextErrors: FormErrors = {};
    if (!questionText.trim()) nextErrors.questionText = 'Question text is required.';
    if (optionTexts.some((text) => !text.trim())) nextErrors.options = `All ${OPTION_COUNT} answer options must be filled in.`;
    if (correctIndex === null) nextErrors.correctOption = 'Select which answer option is correct.';
    if (!explanation.trim()) nextErrors.explanation = 'Explanation is required.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSave({
      id: `q-${Date.now()}`,
      quizType,
      level,
      questionText: questionText.trim(),
      answerOptions: optionTexts.map((text, index) => ({
        id: `q-${Date.now()}-opt-${index}`,
        text: text.trim(),
        isCorrect: index === correctIndex,
      })),
      explanation: explanation.trim(),
    });

    close();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-question-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Question Bank</p>
            <h2 id="add-question-title" className="mt-1 text-xl font-extrabold text-white">
              Add a New Question
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white"
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
              {QUIZ_OPTIONS.map((option) => (
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

          <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Question Prompt
            <textarea
              value={questionText}
              onChange={(event) => setQuestionText(event.target.value)}
              rows={3}
              placeholder="e.g. Which of these user stories is the weakest?"
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

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={close}
              className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
            >
              Save Question
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
