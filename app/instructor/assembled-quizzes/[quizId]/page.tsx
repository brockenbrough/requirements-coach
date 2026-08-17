'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { AddQuizQuestionsModal } from '../../../../components/AddQuizQuestionsModal';
import { ConfirmModal } from '../../../../components/ConfirmModal';
import { QuestionFormModal } from '../../../../components/QuestionFormModal';
import {
  createAndPickQuestionForQuiz,
  deleteAssembledQuiz,
  linkCatalogToQuiz,
  loadQuizDetail,
  removeExtraQuestionFromQuiz,
  unlinkCatalogFromQuiz,
  type AssembledQuizDetail,
  type QuizCatalogComposition,
  type QuizExtraQuestionSummary,
  type QuizLevelCoverage,
} from '../../../../lib/assembledQuizClient';
import { loadQuizzes, type QuizSummary } from '../../../../lib/quizClient';
import type { ActivityType } from '../../../../lib/activityTypes';
import type { QuizQuestion } from '../../../../lib/quizQuestionTypes';
import { useRequireRole } from '../../../../lib/useRequireRole';

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

/**
 * GitHub #361: one quiz's composition — the catalogs it draws from (with the genuinely-active
 * question count, i.e. minus this quiz's own exclusions), per-level coverage warnings, add/remove
 * catalog, and delete-the-whole-quiz. Clicking a catalog row goes to
 * app/instructor/assembled-quizzes/[quizId]/catalogs/[activityType]/page.tsx, the "copy of the
 * catalog in the context of this quiz" view (requirement 3) where individual questions get
 * excluded/included.
 */
export default function AssembledQuizDetailPage({ params }: { params: { quizId: string } }) {
  const { token, loading, authorized } = useRequireRole('instructor');
  const router = useRouter();

  const [quiz, setQuiz] = useState<AssembledQuizDetail | null>(null);
  const [catalogs, setCatalogs] = useState<QuizCatalogComposition[] | null>(null);
  const [levelCoverage, setLevelCoverage] = useState<QuizLevelCoverage[] | null>(null);
  const [extraQuestions, setExtraQuestions] = useState<QuizExtraQuestionSummary[] | null>(null);
  const [activeCatalogQuestionIds, setActiveCatalogQuestionIds] = useState<string[] | null>(null);
  const [allCatalogs, setAllCatalogs] = useState<QuizSummary[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [selectedCatalogToAdd, setSelectedCatalogToAdd] = useState('');
  const [addingCatalog, setAddingCatalog] = useState(false);
  const [addError, setAddError] = useState('');
  const [catalogToRemove, setCatalogToRemove] = useState<QuizCatalogComposition | null>(null);
  const [showDeleteQuiz, setShowDeleteQuiz] = useState(false);
  const [showAddQuestionsModal, setShowAddQuestionsModal] = useState(false);
  const [showCreateQuestionModal, setShowCreateQuestionModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);
    setNotFound(false);

    Promise.all([loadQuizDetail(token, params.quizId), loadQuizzes(token)]).then(([detailResult, catalogsResult]) => {
      if (cancelled) return;

      if (!detailResult.ok) {
        if (detailResult.status === 404) setNotFound(true);
        else setLoadFailed(true);
        return;
      }
      if (!catalogsResult.ok) {
        setLoadFailed(true);
        return;
      }

      setQuiz(detailResult.data.quiz);
      setCatalogs(detailResult.data.catalogs);
      setLevelCoverage(detailResult.data.levelCoverage);
      setExtraQuestions(detailResult.data.extraQuestions);
      setActiveCatalogQuestionIds(detailResult.data.activeCatalogQuestionIds);
      setAllCatalogs(catalogsResult.data.quizzes);
    });

    return () => {
      cancelled = true;
    };
  }, [token, params.quizId, retryCount]);

  if (loading || !authorized) return null;
  if (!token) return null;

  function showToast(message: string) {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3200);
  }

  const linkedActivityTypes = new Set((catalogs ?? []).map((catalog) => catalog.activityType));
  const availableToAdd = (allCatalogs ?? []).filter((catalog) => !linkedActivityTypes.has(catalog.activityType));

  async function handleAddCatalog() {
    if (!selectedCatalogToAdd || !token) return;

    setAddingCatalog(true);
    setAddError('');

    const result = await linkCatalogToQuiz(token, params.quizId, selectedCatalogToAdd);
    setAddingCatalog(false);

    if (!result.ok) {
      setAddError(result.error);
      return;
    }

    const added = (allCatalogs ?? []).find((catalog) => catalog.activityType === selectedCatalogToAdd);
    setCatalogs((current) => [
      ...(current ?? []),
      {
        activityType: selectedCatalogToAdd,
        name: added?.name ?? selectedCatalogToAdd,
        description: added?.description ?? null,
        totalQuestions: added?.questionCount ?? 0,
        excludedCount: 0,
        activeCount: added?.questionCount ?? 0,
      },
    ]);
    setSelectedCatalogToAdd('');
    showToast(`"${added?.name ?? selectedCatalogToAdd}" added to this quiz.`);
    setRetryCount((count) => count + 1); // re-fetch level coverage, which the optimistic insert above can't compute correctly
  }

  async function handleRemoveExtraQuestion(question: QuizExtraQuestionSummary) {
    if (!token) return;
    if (!confirm(`Remove "${question.questionText}" from this quiz?`)) return;

    const result = await removeExtraQuestionFromQuiz(token, params.quizId, question.questionId);
    if (!result.ok) {
      showToast(result.error);
      return;
    }

    setExtraQuestions((current) => (current ?? []).filter((q) => q.questionId !== question.questionId));
    showToast('Question removed from this quiz.');
    setRetryCount((count) => count + 1); // re-fetch level coverage now that a hand-picked question is gone from the pool
  }

  // GitHub #380 extension: catalog choices offered by the reused QuestionFormModal when creating
  // a brand-new question from this page — the quiz's own linked catalogs when it has any (so the
  // instructor's most likely target is already selected), falling back to every catalog in the
  // system when it has none (a question must always belong to a catalog, so this choice can never
  // be skipped, only defaulted).
  const catalogOptionsForCreate: { value: ActivityType; label: string }[] =
    catalogs && catalogs.length > 0
      ? catalogs.map((catalog) => ({ value: catalog.activityType as ActivityType, label: catalog.name }))
      : (allCatalogs ?? []).map((catalog) => ({ value: catalog.activityType as ActivityType, label: catalog.name }));

  async function handleCreateAndPickQuestion(question: QuizQuestion): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!token) return { ok: false, error: 'Your session has expired. Please sign in again.' };

    const result = await createAndPickQuestionForQuiz(token, params.quizId, question);
    if (!result.ok) return { ok: false, error: result.error };

    setExtraQuestions((current) => [...(current ?? []), result.data.extraQuestion]);
    showToast(`"${result.data.extraQuestion.questionText}" created and added to this quiz.`);
    setRetryCount((count) => count + 1); // re-fetch level coverage now that a new question is in the pool
    return { ok: true };
  }

  return (
    <AppShell active="instructor-assembled-quizzes">
      <div className="mx-auto max-w-3xl">
        <Link href="/instructor/assembled-quizzes" className="mb-4 inline-block text-xs font-bold text-gray-500 hover:text-brand-purple">
          ← Back to Quizzes
        </Link>

        {notFound ? (
          <p className="mt-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            This quiz doesn&apos;t exist.
          </p>
        ) : loadFailed ? (
          <div className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load this quiz.</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : !quiz || !catalogs || !levelCoverage || !extraQuestions || !activeCatalogQuestionIds || !allCatalogs ? (
          <p className="mt-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="mb-1 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">{quiz.name}</h1>
                <p className="max-w-2xl text-sm font-semibold text-gray-500">
                  {quiz.description ? `${quiz.description} · ` : ''}
                  {quiz.courseName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteQuiz(true)}
                className="flex flex-none items-center gap-2 rounded-full border border-brand-danger/40 px-5 py-2.5 text-sm font-extrabold text-brand-danger transition hover:bg-brand-danger/10"
              >
                Delete quiz
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

            {levelCoverage.some((level) => !level.sufficient) ? (
              <div className="mb-5 mt-5 space-y-2">
                {levelCoverage
                  .filter((level) => !level.sufficient)
                  .map((level) => (
                    <div
                      key={level.level}
                      role="alert"
                      className="flex items-center gap-2.5 rounded-brand-md border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 text-sm font-bold text-brand-danger"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      </svg>
                      {LEVEL_LABEL[level.level]} (Level {level.level}) has only {level.available} of {level.required} required questions
                      left after exclusions.
                    </div>
                  ))}
              </div>
            ) : null}

            <div className="mb-3 mt-6 flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-wide text-gray-400">From catalogs</p>
            </div>
            <p className="mb-4 text-xs font-semibold text-gray-500">
              Each catalog below is shown as it applies to this quiz only — excluding a question here never changes
              the original catalog. Click a catalog to manage its exclusions.
            </p>

            <div className="mb-6 space-y-3">
              {catalogs.length === 0 ? (
                <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                  This quiz has no catalogs yet — add one below.
                </p>
              ) : (
                catalogs.map((catalog) => (
                  <div
                    key={catalog.activityType}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-brand-lg border border-gray-100 bg-gray-50 p-4"
                  >
                    <Link
                      href={`/instructor/assembled-quizzes/${encodeURIComponent(params.quizId)}/catalogs/${encodeURIComponent(catalog.activityType)}`}
                      className="min-w-0 flex-1"
                    >
                      <p className="font-extrabold text-brand-navy hover:text-brand-purple hover:underline">{catalog.name}</p>
                      {catalog.description ? <p className="mt-0.5 text-xs font-semibold text-gray-500">{catalog.description}</p> : null}
                      <p className="mt-1 text-xs font-bold text-gray-600">
                        {catalog.activeCount} of {catalog.totalQuestions} questions active
                        {catalog.excludedCount > 0 ? ` · ${catalog.excludedCount} excluded for this quiz` : ''}
                      </p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setCatalogToRemove(catalog)}
                      className="flex-none rounded-full border border-gray-300 px-4 py-1.5 text-xs font-extrabold text-gray-600 transition hover:border-brand-danger hover:text-brand-danger"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">Add a catalog</p>
            <div className="flex flex-wrap items-center gap-3 rounded-brand-lg border border-gray-100 bg-gray-50 p-4">
              <select
                value={selectedCatalogToAdd}
                onChange={(event) => setSelectedCatalogToAdd(event.target.value)}
                className="flex-1 rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
              >
                <option value="">
                  {availableToAdd.length === 0 ? 'Every catalog is already in this quiz' : 'Select a catalog…'}
                </option>
                {availableToAdd.map((catalog) => (
                  <option key={catalog.activityType} value={catalog.activityType}>
                    {catalog.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddCatalog}
                disabled={!selectedCatalogToAdd || addingCatalog}
                className="flex-none rounded-brand-md bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {addingCatalog ? 'Adding…' : 'Add'}
              </button>
            </div>
            {addError ? <p className="mt-2 text-xs font-bold text-brand-danger">{addError}</p> : null}

            <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold uppercase tracking-wide text-gray-400">Individually added questions</p>
              <div className="flex flex-none flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateQuestionModal(true)}
                  disabled={catalogOptionsForCreate.length === 0}
                  title={catalogOptionsForCreate.length === 0 ? 'No catalogs exist yet to file a new question under.' : undefined}
                  className="flex-none rounded-full border border-brand-purple/40 px-4 py-1.5 text-xs font-extrabold text-brand-purple transition hover:bg-brand-purple/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Create new question
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddQuestionsModal(true)}
                  className="flex-none rounded-full border border-brand-purple/40 px-4 py-1.5 text-xs font-extrabold text-brand-purple transition hover:bg-brand-purple/10"
                >
                  Add individual questions
                </button>
              </div>
            </div>
            <p className="mb-4 text-xs font-semibold text-gray-500">
              Questions picked here count toward this quiz&apos;s pool regardless of whether their own catalog is
              linked above. Removing one only drops it from this quiz — the original question, its catalog, and
              every other quiz are unaffected.
            </p>

            <div className="space-y-3">
              {extraQuestions.length === 0 ? (
                <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                  No individually added questions yet.
                </p>
              ) : (
                extraQuestions.map((question) => (
                  <div
                    key={question.questionId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-brand-lg border border-gray-100 bg-gray-50 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-brand-navy">{question.questionText}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-gray-500">
                        <span className="rounded-full bg-white px-2 py-0.5">{question.catalogName}</span>
                        <span className="rounded-full bg-white px-2 py-0.5">{LEVEL_LABEL[question.level]}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveExtraQuestion(question)}
                      aria-label={`Remove "${question.questionText}" from this quiz`}
                      title="Remove from this quiz"
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition hover:border-brand-danger hover:text-brand-danger"
                    >
                      <RemoveIcon />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {catalogToRemove ? (
        <ConfirmModal
          kicker="Quizzes"
          title="Remove Catalog"
          message={
            <>
              Remove <span className="font-extrabold text-white">{catalogToRemove.name}</span> from this quiz? This quiz will lose{' '}
              {catalogToRemove.activeCount} active question{catalogToRemove.activeCount === 1 ? '' : 's'}. The catalog itself, and its
              questions, are not affected — only this quiz&apos;s ability to draw from it.
            </>
          }
          confirmLabel="Remove catalog"
          confirmingLabel="Removing…"
          onClose={() => setCatalogToRemove(null)}
          onConfirm={async () => {
            if (!token) return { ok: false as const, error: 'Your session has expired. Please sign in again.' };
            const result = await unlinkCatalogFromQuiz(token, params.quizId, catalogToRemove.activityType);
            if (!result.ok) return { ok: false as const, error: result.error };

            setCatalogs((current) => (current ?? []).filter((c) => c.activityType !== catalogToRemove.activityType));
            showToast(`"${catalogToRemove.name}" removed from this quiz.`);
            setRetryCount((count) => count + 1); // re-fetch level coverage now that a catalog's questions are gone from the pool
            return { ok: true as const };
          }}
        />
      ) : null}

      {showDeleteQuiz ? (
        <ConfirmModal
          kicker="Quizzes"
          title="Delete Quiz"
          message={
            <>
              Delete this quiz? Students will no longer be able to start it. The underlying question catalogs are not affected.
            </>
          }
          confirmLabel="Delete quiz"
          confirmingLabel="Deleting…"
          onClose={() => setShowDeleteQuiz(false)}
          onConfirm={async () => {
            if (!token) return { ok: false as const, error: 'Your session has expired. Please sign in again.' };
            const result = await deleteAssembledQuiz(token, params.quizId);
            if (!result.ok) return { ok: false as const, error: result.error };

            router.push('/instructor/assembled-quizzes');
            return { ok: true as const };
          }}
        />
      ) : null}

      {showAddQuestionsModal && token ? (
        <AddQuizQuestionsModal
          token={token}
          quizId={params.quizId}
          // Already-included regardless of source: every question currently active through a
          // linked catalog (not excluded) plus every question already hand-picked — see
          // getQuizComposition's own docblock for why activeCatalogQuestionIds exists.
          alreadyIncludedIds={new Set([...(activeCatalogQuestionIds ?? []), ...(extraQuestions ?? []).map((q) => q.questionId)])}
          onClose={() => setShowAddQuestionsModal(false)}
          onAdded={(questionIds) => {
            showToast(`${questionIds.length} question${questionIds.length === 1 ? '' : 's'} added to this quiz.`);
            setRetryCount((count) => count + 1); // re-fetch composition + level coverage with the new hand-picks included
          }}
          onCreateNew={
            catalogOptionsForCreate.length > 0
              ? () => {
                  setShowAddQuestionsModal(false);
                  setShowCreateQuestionModal(true);
                }
              : undefined
          }
        />
      ) : null}

      {showCreateQuestionModal && catalogOptionsForCreate.length > 0 ? (
        <QuestionFormModal
          mode="add"
          defaultQuizType={catalogOptionsForCreate[0].value}
          quizOptions={catalogOptionsForCreate}
          onClose={() => setShowCreateQuestionModal(false)}
          onSave={handleCreateAndPickQuestion}
        />
      ) : null}
    </AppShell>
  );
}
