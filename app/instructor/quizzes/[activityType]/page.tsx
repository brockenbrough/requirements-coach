'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { DeleteQuestionModal } from '../../../../components/DeleteQuestionModal';
import { QuestionFormModal } from '../../../../components/QuestionFormModal';
import { loadQuizDetail, type QuizMeta } from '../../../../lib/quizClient';
import { createQuestion, updateQuestion } from '../../../../lib/sessionClient';
import type { CatalogQuestion, QuizQuestion } from '../../../../lib/quizQuestionTypes';
import { useRequireRole } from '../../../../lib/useRequireRole';

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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

type ModalState = { mode: 'add' } | { mode: 'edit'; question: CatalogQuestion };

/**
 * GitHub #359: one question catalog's detail view — read-only by default (every question in the
 * catalog, any author, per GET /api/instructor/quizzes/{activityType}), an "Edit" toggle away
 * from add/edit/delete on the caller's own questions. Replaces the retired flat Question Bank
 * page; see CLAUDE.md for how this relates to the "quiz" plumbing from GitHub #347 it's built on.
 *
 * A question has exactly one activity_type column (no join table), so every mutation here is
 * naturally scoped to this catalog alone — there's no cross-catalog side effect to guard against.
 */
export default function CatalogDetailPage({ params }: { params: { activityType: string } }) {
  const { token, profile, loading, authorized } = useRequireRole('instructor');

  const [quiz, setQuiz] = useState<QuizMeta | null>(null);
  const [questions, setQuestions] = useState<CatalogQuestion[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [level, setLevel] = useState<1 | 2 | 3 | 'all'>('all');
  const [editMode, setEditMode] = useState(false);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogQuestion | null>(null);
  const [highlight, setHighlight] = useState<{ id: string; label: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);
    setNotFound(false);

    loadQuizDetail(token, params.activityType).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setQuiz(result.data.quiz);
        setQuestions(result.data.questions);
      } else if (result.status === 404) {
        setNotFound(true);
      } else {
        setLoadFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, params.activityType, retryCount]);

  if (loading || !authorized) return null;
  if (!token || !profile) return null;

  const visibleQuestions = (questions ?? []).filter((question) => level === 'all' || question.level === level);
  const quizOptions = quiz ? [{ value: params.activityType, label: quiz.name }] : [];

  async function handleSaveQuestion(question: QuizQuestion): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!token || !profile?.user_id) return { ok: false, error: 'Your session has expired. Please sign in again.' };

    const isEdit = modalState?.mode === 'edit';
    const result = isEdit ? await updateQuestion(token, question) : await createQuestion(token, question);
    if (!result.ok) return { ok: false, error: result.error };

    // POST assigns real UUIDs server-side; the modal's placeholder ids (q-${Date.now()}, etc.)
    // must not be kept. Editing preserves ownerId from the row already in state — this route only
    // ever edits the caller's own questions (the icon is hidden otherwise), but the response to
    // PATCH carries no ownerId to read it back from.
    const savedQuestion: CatalogQuestion = isEdit
      ? { ...question, ownerId: modalState?.mode === 'edit' ? modalState.question.ownerId : profile.user_id }
      : {
          ...question,
          id: result.data.questionId,
          answerOptions: question.answerOptions.map((option, index) => ({
            ...option,
            id: result.data.answerIds[index],
          })),
          ownerId: profile.user_id,
        };

    setQuestions((current) =>
      isEdit
        ? (current ?? []).map((existing) => (existing.id === savedQuestion.id ? savedQuestion : existing))
        : [savedQuestion, ...(current ?? [])],
    );

    setLevel('all');
    setHighlight({ id: savedQuestion.id, label: isEdit ? '✓ Updated' : '✓ Just added' });
    setToastMessage(isEdit ? 'Changes saved.' : 'Question added to this catalog.');

    window.setTimeout(() => setToastMessage(null), TOAST_MS);
    window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);

    return { ok: true };
  }

  function handleDeleted(questionId: string) {
    setQuestions((current) => (current ?? []).filter((question) => question.id !== questionId));
    setDeleteTarget(null);
    setToastMessage('Question deleted.');
    window.setTimeout(() => setToastMessage(null), TOAST_MS);
  }

  return (
    <AppShell active="instructor-quizzes">
      <div className="mx-auto max-w-3xl">
        <Link href="/instructor/quizzes" className="mb-4 inline-block text-xs font-bold text-gray-500 hover:text-brand-purple">
          ← Back to Question Catalogs
        </Link>

        {notFound ? (
          <p className="mt-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            This catalog doesn&apos;t exist.
          </p>
        ) : loadFailed ? (
          <div className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load this catalog.</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : !quiz || questions === null ? (
          <p className="mt-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="mb-1 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">{quiz.name}</h1>
                <p className="max-w-2xl text-sm font-semibold text-gray-500">
                  {quiz.description ? `${quiz.description} · ` : ''}
                  {questions.length} question{questions.length === 1 ? '' : 's'} · by {quiz.authorName} ·{' '}
                  {quiz.courseName ?? 'Not linked to a course yet'}
                </p>
              </div>
              <div className="flex flex-none items-center gap-2">
                {editMode ? (
                  <button
                    type="button"
                    onClick={() => setModalState({ mode: 'add' })}
                    className="flex items-center gap-2 rounded-full bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    New Question
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setEditMode((current) => !current)}
                  className={`rounded-full border px-5 py-2.5 text-sm font-extrabold transition ${
                    editMode
                      ? 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                      : 'border-brand-purple bg-white text-brand-purple hover:bg-brand-purple hover:text-white'
                  }`}
                >
                  {editMode ? 'Done' : 'Edit'}
                </button>
              </div>
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

            <div className="mb-6 mt-6 flex flex-wrap gap-1.5">
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

            <div className="space-y-4">
              {visibleQuestions.length === 0 ? (
                <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                  No questions yet at this level.
                </p>
              ) : (
                visibleQuestions.map((question) => {
                  const isMine = question.ownerId === profile.user_id;
                  return (
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
                        {editMode && isMine ? (
                          <div className="flex flex-none items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setModalState({ mode: 'edit', question })}
                              aria-label="Edit this question"
                              title="Edit this question"
                              className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-purple hover:text-brand-purple"
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(question)}
                              aria-label="Delete this question"
                              title="Delete this question"
                              className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-danger hover:text-brand-danger"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        ) : null}
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
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {modalState ? (
        <QuestionFormModal
          mode={modalState.mode}
          initialData={modalState.mode === 'edit' ? modalState.question : undefined}
          defaultQuizType={params.activityType}
          quizOptions={quizOptions}
          onClose={() => setModalState(null)}
          onSave={handleSaveQuestion}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteQuestionModal
          question={deleteTarget}
          token={token}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      ) : null}
    </AppShell>
  );
}
