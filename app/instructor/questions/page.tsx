'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { QuestionFormModal } from '../../../components/QuestionFormModal';
import { ACTIVITIES, getActivityByType } from '../../../lib/activityContent';
import type { ActivityType } from '../../../lib/activityTypes';
import { createQuestion, loadInstructorQuestions, updateQuestion } from '../../../lib/sessionClient';
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
 * Browse of the question bank (GitHub #170, fetched from GET /api/instructor/questions), plus
 * adding (GitHub #120, POST /api/instructor/questions) and editing (GitHub #158,
 * PATCH /api/instructor/questions/{id}) a question — both through the same popup form.
 */
export default function InstructorQuestionsPage() {
  const { token, loading, authorized } = useRequireRole('instructor');

  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<ActivityType>(ACTIVITIES[0].activityType);
  const [level, setLevel] = useState<1 | 2 | 3 | 'all'>('all');
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [highlight, setHighlight] = useState<{ id: string; label: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadInstructorQuestions(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setQuestions(result.data.questions);
      } else {
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading || !authorized) return null;

  const visibleQuestions = (questions ?? []).filter((question) => {
    if (question.quizType !== activityType) return false;
    if (level !== 'all' && question.level !== level) return false;
    return true;
  });

  async function handleSaveQuestion(question: QuizQuestion): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!token) return { ok: false, error: 'Your session has expired. Please sign in again.' };

    // The modal's own mode (not an id lookup) is what tells an edit and a new question apart —
    // a client-generated placeholder id could otherwise collide with nothing and look like "add".
    const isEdit = modalState?.mode === 'edit';
    const result = isEdit ? await updateQuestion(token, question) : await createQuestion(token, question);
    if (!result.ok) return { ok: false, error: result.error };

    // POST assigns real UUIDs server-side; the modal's placeholder ids (q-${Date.now()}, etc.)
    // must not be kept, or a later edit would send ids the PATCH route has never seen.
    const savedQuestion: QuizQuestion = isEdit
      ? question
      : {
          ...question,
          id: result.data.questionId,
          answerOptions: question.answerOptions.map((option, index) => ({
            ...option,
            id: result.data.answerIds[index],
          })),
        };

    setQuestions((current) =>
      isEdit
        ? (current ?? []).map((existing) => (existing.id === savedQuestion.id ? savedQuestion : existing))
        : [savedQuestion, ...(current ?? [])],
    );

    // Jump the view to wherever the question landed — otherwise a save that also moved the
    // question to a different quiz/level would look like it silently failed.
    setActivityType(savedQuestion.quizType);
    setLevel(savedQuestion.level);
    setHighlight({ id: savedQuestion.id, label: isEdit ? '✓ Updated' : '✓ Just added' });

    const quizName = getActivityByType(savedQuestion.quizType)?.name ?? savedQuestion.quizType;
    setToastMessage(isEdit ? `Changes saved to ${quizName}.` : `Question added to ${quizName}.`);

    window.setTimeout(() => setToastMessage(null), TOAST_MS);
    window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);

    return { ok: true };
  }

  return (
    <AppShell active="instructor-questions">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Question Bank</h1>
            <p className="max-w-2xl text-sm font-semibold text-gray-500">
              Every question you've added, across every activity and difficulty level. Add a new question, or edit an existing one, at any level.
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

        {error ? (
          <p className="mt-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            {error}
          </p>
        ) : questions === null ? (
          <p className="mt-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
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
          </>
        )}
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
