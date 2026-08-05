'use client';

import { useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { QuestionFormModal } from '../../../components/QuestionFormModal';
import { ACTIVITIES, getActivityByType } from '../../../lib/activityContent';
import type { ActivityType } from '../../../lib/activityTypes';
import { MOCK_QUESTIONS } from '../../../lib/mockQuestions';
import type { QuizQuestion } from '../../../lib/quizQuestionTypes';
import { useRequireRole } from '../../../lib/useRequireRole';

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const LEVEL_OPTIONS = ['all', 1, 2, 3] as const;
const HIGHLIGHT_MS = 4000;
const TOAST_MS = 3200;

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

type ModalState = { mode: 'add' } | { mode: 'edit'; question: QuizQuestion };

/**
 * Read-only browse of the question bank, plus adding (GitHub #120) and editing (GitHub #158) a
 * question — both through the same popup form. Everything here runs on MOCK_QUESTIONS in local
 * state; see lib/mockQuestions.ts for what replacing it with a real fetch/mutation involves.
 */
export default function InstructorQuestionsPage() {
  const { loading, authorized } = useRequireRole('instructor');

  const [questions, setQuestions] = useState<QuizQuestion[]>(MOCK_QUESTIONS);
  const [activityType, setActivityType] = useState<ActivityType>(ACTIVITIES[0].activityType);
  const [level, setLevel] = useState<1 | 2 | 3 | 'all'>('all');
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [highlight, setHighlight] = useState<{ id: string; label: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (loading || !authorized) return null;

  const visibleQuestions = questions.filter((question) => {
    if (question.quizType !== activityType) return false;
    if (level !== 'all' && question.level !== level) return false;
    return true;
  });

  function handleSaveQuestion(question: QuizQuestion) {
    // The id already existing in state is what tells an edit and a new question apart — the
    // form itself doesn't need to report which one it was.
    const isEdit = questions.some((existing) => existing.id === question.id);

    setQuestions((current) =>
      isEdit ? current.map((existing) => (existing.id === question.id ? question : existing)) : [question, ...current],
    );

    // Jump the view to wherever the question landed — otherwise a save that also moved the
    // question to a different quiz/level would look like it silently failed.
    setActivityType(question.quizType);
    setLevel(question.level);
    setHighlight({ id: question.id, label: isEdit ? '✓ Updated' : '✓ Just added' });

    const quizName = getActivityByType(question.quizType)?.name ?? question.quizType;
    setToastMessage(isEdit ? `Changes saved to ${quizName}.` : `Question added to ${quizName}.`);

    window.setTimeout(() => setToastMessage(null), TOAST_MS);
    window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
  }

  return (
    <AppShell active="instructor-questions">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Question Bank</h1>
            <p className="max-w-2xl text-sm font-semibold text-gray-500">
              Every question across every activity and difficulty level. Add a new question, or edit an existing one, at any level.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModalState({ mode: 'add' })}
            className="flex flex-none items-center gap-2 rounded-full bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Question
          </button>
        </div>

        {toastMessage ? (
          <div
            role="status"
            className="mb-5 mt-5 flex items-center gap-2.5 rounded-brand-md border border-brand-teal/40 bg-brand-teal/10 px-4 py-3 text-sm font-bold text-brand-teal-dark"
          >
            <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-teal text-brand-teal-ink">
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            {toastMessage}
          </div>
        ) : null}

        <div className="mb-6 mt-6 flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITIES.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => setActivityType(item.activityType)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                  activityType === item.activityType
                    ? 'border-brand-purple bg-brand-purple text-white'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LEVEL_OPTIONS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevel(lvl)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                  level === lvl
                    ? 'border-brand-purple bg-brand-purple text-white'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                }`}
              >
                {lvl === 'all' ? 'All levels' : LEVEL_LABEL[lvl]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {visibleQuestions.length === 0 ? (
            <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
              No questions yet at this level.
            </p>
          ) : (
            visibleQuestions.map((question) => (
              <div
                key={question.id}
                className={`rounded-brand-lg border bg-gray-50 p-5 transition ${
                  question.id === highlight?.id ? 'border-brand-teal/50 ring-2 ring-brand-teal/30' : 'border-gray-100'
                }`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-block rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-gray-500">
                      {LEVEL_LABEL[question.level]} · Level {question.level}
                    </span>
                    {question.id === highlight?.id ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/20 px-2.5 py-1 text-[11px] font-extrabold text-brand-teal-dark">
                        {highlight.label}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalState({ mode: 'edit', question })}
                    aria-label="Edit this question"
                    title="Edit this question"
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-purple hover:text-brand-purple"
                  >
                    <EditIcon />
                  </button>
                </div>
                <p className="mb-4 text-sm font-bold text-brand-navy">{question.questionText}</p>
                <div className="space-y-2">
                  {question.answerOptions.map((option) => (
                    <div
                      key={option.id}
                      className={`rounded-brand-md border p-3 ${
                        option.isCorrect ? 'border-brand-teal/40 bg-brand-teal/10' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-semibold ${option.isCorrect ? 'text-brand-teal-dark' : 'text-gray-700'}`}>
                          {option.text}
                        </p>
                        {option.isCorrect ? (
                          <span className="flex-none rounded-full bg-brand-teal/20 px-2 py-0.5 text-[11px] font-extrabold text-brand-teal-dark">
                            Correct
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs font-semibold text-gray-500">
                  <span className="font-extrabold text-gray-600">Explanation: </span>
                  {question.explanation}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {modalState ? (
        <QuestionFormModal
          mode={modalState.mode}
          initialData={modalState.mode === 'edit' ? modalState.question : undefined}
          defaultQuizType={activityType}
          onClose={() => setModalState(null)}
          onSave={handleSaveQuestion}
        />
      ) : null}
    </AppShell>
  );
}
