'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { CreateQuizModal } from '../../../components/CreateQuizModal';
import { loadAssembledQuizzes, type AssembledQuizSummary } from '../../../lib/assembledQuizClient';
import { loadCourses, type CourseSummary } from '../../../lib/courseClient';
import { loadQuizzes, type QuizSummary } from '../../../lib/quizClient';
import { useRequireRole } from '../../../lib/useRequireRole';
import type { GradingKind } from '../../../lib/activityTypes';

const TOAST_MS = 3200;

/**
 * GitHub #360: compose a quiz from one or more question catalogs (GitHub #347/#359) for one of
 * the instructor's own courses (GitHub #241). Deliberately a different page/nav item from
 * "Question Catalogs" (app/instructor/quizzes/page.tsx) — see CLAUDE.md for why the two "quiz"
 * concepts in this codebase aren't the same table. This page only composes a quiz (which
 * catalogs, which course); it does not yet let a student take one — that's the natural next step,
 * once a session route knows how to draw from an assembled_quiz's catalogs
 * (lib/assembledQuizQueries.ts's pickRandomQuestions/loadCatalogQuestionPool are ready for it).
 *
 * Create-quiz flow (GitHub #360 follow-up): a button-triggered popup (components/CreateQuizModal.tsx),
 * replacing the permanently visible inline form this page used to render below the list — same
 * button-plus-popup pattern app/instructor/quizzes/page.tsx uses for catalogs.
 */
export default function InstructorAssembledQuizzesPage() {
  const { token, loading, authorized } = useRequireRole('instructor');

  const [quizzes, setQuizzes] = useState<AssembledQuizSummary[] | null>(null);
  const [catalogs, setCatalogs] = useState<QuizSummary[] | null>(null);
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadFailed(false);

    Promise.all([loadAssembledQuizzes(token), loadQuizzes(token), loadCourses(token)]).then(
      ([quizzesResult, catalogsResult, coursesResult]) => {
        if (cancelled) return;
        if (quizzesResult.ok && catalogsResult.ok && coursesResult.ok) {
          setQuizzes(quizzesResult.data.quizzes);
          // GitHub #478: a quiz can compose a built-in example catalog too, not just the
          // instructor's own — composing only links it (assembled_quiz_catalog), it never writes
          // to the catalog itself, so this doesn't compromise "the original is read-only".
          setCatalogs([...catalogsResult.data.quizzes, ...catalogsResult.data.exampleCatalogs]);
          setCourses(coursesResult.data.courses);
        } else {
          setLoadFailed(true);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [token, retryCount]);

  if (loading || !authorized) return null;
  if (!token) return null;

  function handleCreated(quiz: {
    id: string;
    name: string;
    description: string | null;
    courseId: string;
    gradingKind: AssembledQuizSummary['gradingKind'];
    questionsPerLevel: number;
    catalogs: { activityType: string; name: string; gradingKind: GradingKind }[];
    catalogNames: string[];
  }) {
    const course = (courses ?? []).find((c) => c.id === quiz.courseId);

    setQuizzes((current) => [
      {
        id: quiz.id,
        name: quiz.name,
        description: quiz.description,
        courseId: quiz.courseId,
        courseName: course?.name ?? 'Unknown course',
        gradingKind: quiz.gradingKind,
        questionsPerLevel: quiz.questionsPerLevel,
        catalogs: quiz.catalogs,
        catalogNames: quiz.catalogNames,
        createdAt: new Date().toISOString(),
      },
      ...(current ?? []),
    ]);

    setToastMessage(`"${quiz.name}" created.`);
    window.setTimeout(() => setToastMessage(null), TOAST_MS);
  }

  return (
    <AppShell active="instructor-assembled-quizzes">
      <div className="mx-auto max-w-4xl">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Quizzes</h1>
            <p className="max-w-2xl text-sm font-semibold text-gray-500">
              Compose a quiz from one or more question catalogs for one of your courses. Each difficulty level draws
              its questions at random from every selected catalog, fresh for every attempt.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex flex-none items-center gap-2 rounded-full bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create quiz
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

        <div className="mt-6">
          {loadFailed ? (
            <div className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
              <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load this page.</p>
              <button
                type="button"
                onClick={() => setRetryCount((count) => count + 1)}
                className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
              >
                Retry
              </button>
            </div>
          ) : quizzes === null || catalogs === null || courses === null ? (
            <p className="mb-6 text-sm font-semibold text-gray-500">Loading…</p>
          ) : (
            <>
              <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">
                {quizzes.length} quiz{quizzes.length === 1 ? '' : 'zes'}
              </p>

              <div className="mb-8 overflow-x-auto rounded-brand-lg border border-brand-navy-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-brand-navy text-brand-ink-muted">
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Name</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Type</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Course</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Catalogs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizzes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="bg-brand-navy-2 px-4 py-10 text-center text-sm font-semibold text-brand-ink-muted">
                          You haven&apos;t created a quiz yet.
                        </td>
                      </tr>
                    ) : (
                      quizzes.map((quiz) => (
                        <tr key={quiz.id} className="border-t border-gray-100 bg-white transition hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3 font-extrabold text-brand-navy">
                            <Link href={`/instructor/assembled-quizzes/${encodeURIComponent(quiz.id)}`} className="hover:text-brand-purple hover:underline">
                              {quiz.name}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {/* Same badge convention app/instructor/quizzes/page.tsx uses for a catalog's own gradingKind. */}
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                                quiz.gradingKind === 'llm-graded'
                                  ? 'bg-brand-teal/15 text-brand-teal-dark'
                                  : 'bg-brand-purple/10 text-brand-purple-dark'
                              }`}
                            >
                              {quiz.gradingKind === 'llm-graded' ? 'LLM-graded' : 'Multiple choice'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-500">{quiz.courseName}</td>
                          <td className="px-4 py-3 text-gray-500">{quiz.catalogNames.join(', ') || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {showCreateModal && catalogs && courses ? (
        <CreateQuizModal
          token={token}
          courses={courses}
          catalogs={catalogs}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </AppShell>
  );
}
