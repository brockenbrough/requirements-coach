'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../../../components/AppShell';
import {
  excludeQuestionFromQuiz,
  includeQuestionInQuiz,
  loadQuizCatalogQuestions,
  loadQuizDetail,
  type AssembledQuizDetail,
  type QuizScopedQuestion,
} from '../../../../../../lib/assembledQuizClient';
import { useRequireRole } from '../../../../../../lib/useRequireRole';

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

function ExcludeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

function IncludeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * GitHub #361 requirement 3: one catalog's questions, in the context of one quiz — the "copy of
 * the catalog" the user story describes, implemented as the catalog's real questions annotated
 * with this quiz's own exclusion state rather than duplicated rows (see the quiz_excluded_question
 * table comment in supabase/schema.sql). Deliberately no edit/delete affordance here at all — a
 * question's content only ever changes through the real catalog (GitHub #359's
 * app/instructor/quizzes/[activityType]/page.tsx), so there is no path from this screen back to
 * the original catalog getting altered.
 */
export default function QuizCatalogQuestionsPage({ params }: { params: { quizId: string; activityType: string } }) {
  const { token, loading, authorized } = useRequireRole('instructor');

  const [quiz, setQuiz] = useState<AssembledQuizDetail | null>(null);
  const [catalogName, setCatalogName] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizScopedQuestion[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);
    setNotFound(false);

    Promise.all([loadQuizDetail(token, params.quizId), loadQuizCatalogQuestions(token, params.quizId, params.activityType)]).then(
      ([quizResult, catalogResult]) => {
        if (cancelled) return;

        if (!quizResult.ok) {
          if (quizResult.status === 404) setNotFound(true);
          else setLoadFailed(true);
          return;
        }
        if (!catalogResult.ok) {
          if (catalogResult.status === 404) setNotFound(true);
          else setLoadFailed(true);
          return;
        }

        setQuiz(quizResult.data.quiz);
        setCatalogName(catalogResult.data.catalog.name);
        setQuestions(catalogResult.data.questions);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [token, params.quizId, params.activityType, retryCount]);

  if (loading || !authorized) return null;
  if (!token) return null;

  async function toggleExclusion(question: QuizScopedQuestion) {
    if (!token || pendingQuestionId) return;

    setPendingQuestionId(question.id);
    setError('');

    const result = question.excludedForQuiz
      ? await includeQuestionInQuiz(token, params.quizId, question.id)
      : await excludeQuestionFromQuiz(token, params.quizId, question.id);

    setPendingQuestionId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setQuestions((current) =>
      (current ?? []).map((q) => (q.id === question.id ? { ...q, excludedForQuiz: !question.excludedForQuiz } : q)),
    );
  }

  return (
    <AppShell active="instructor-assembled-quizzes">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/instructor/assembled-quizzes/${encodeURIComponent(params.quizId)}`}
          className="mb-4 inline-block text-xs font-bold text-gray-500 hover:text-brand-purple"
        >
          ← Back to {quiz?.name ?? 'quiz'}
        </Link>

        {notFound ? (
          <p className="mt-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            This quiz or catalog doesn&apos;t exist.
          </p>
        ) : loadFailed ? (
          <div className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load these questions.</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : !quiz || catalogName === null || questions === null ? (
          <p className="mt-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">{catalogName}</h1>
            <p className="mb-1 text-sm font-semibold text-gray-500">
              Showing this catalog&apos;s questions as they apply to <span className="font-extrabold text-gray-700">{quiz.name}</span>.
            </p>
            <p className="mb-6 text-xs font-bold uppercase tracking-wide text-brand-purple">
              Exclusions apply to this quiz only — the original catalog is never changed here.
            </p>

            {error ? (
              <p className="mb-4 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-3 text-sm font-semibold text-brand-danger">
                {error}
              </p>
            ) : null}

            <div className="space-y-4">
              {questions.length === 0 ? (
                <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                  This catalog has no questions yet.
                </p>
              ) : (
                questions.map((question) => (
                  <div
                    key={question.id}
                    className={`rounded-brand-lg border p-5 transition ${
                      question.excludedForQuiz ? 'border-gray-200 bg-gray-100 opacity-60' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-block rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-gray-500">
                          {LEVEL_LABEL[question.level]} · Level {question.level}
                        </span>
                        {question.excludedForQuiz ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-300 px-2.5 py-1 text-[11px] font-extrabold text-gray-600">
                            Excluded
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExclusion(question)}
                        disabled={pendingQuestionId === question.id}
                        aria-label={question.excludedForQuiz ? 'Include this question in the quiz' : 'Exclude this question from the quiz'}
                        title={question.excludedForQuiz ? 'Include in this quiz' : 'Exclude from this quiz'}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          question.excludedForQuiz
                            ? 'border-brand-teal/40 bg-white text-brand-teal-dark hover:border-brand-teal'
                            : 'border-gray-300 bg-white text-gray-600 hover:border-brand-danger hover:text-brand-danger'
                        }`}
                      >
                        {question.excludedForQuiz ? <IncludeIcon /> : <ExcludeIcon />}
                        {pendingQuestionId === question.id ? '…' : question.excludedForQuiz ? 'Include' : 'Exclude'}
                      </button>
                    </div>
                    <p className={`mb-4 text-sm font-bold ${question.excludedForQuiz ? 'text-gray-500' : 'text-brand-navy'}`}>
                      {question.questionText}
                    </p>
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
    </AppShell>
  );
}
