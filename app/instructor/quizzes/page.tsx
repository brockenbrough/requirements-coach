'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { CreateCatalogModal } from '../../../components/CreateCatalogModal';
import { DuplicateCatalogModal } from '../../../components/DuplicateCatalogModal';
import { loadQuizzes, type CreatedQuiz, type DuplicatedQuiz, type QuizSummary } from '../../../lib/quizClient';
import { useRequireRole } from '../../../lib/useRequireRole';

const TOAST_MS = 3200;

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function GradingKindBadge({ gradingKind }: { gradingKind: QuizSummary['gradingKind'] }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
        gradingKind === 'llm-graded' ? 'bg-brand-teal/15 text-brand-teal-dark' : 'bg-brand-purple/10 text-brand-purple-dark'
      }`}
    >
      {gradingKind === 'llm-graded' ? 'LLM-graded' : 'Multiple choice'}
    </span>
  );
}

/**
 * GitHub #347/#359/#478: every question catalog the calling instructor created, plus the built-in
 * example catalogs every instructor sees regardless (GitHub #478) — two clearly separated lists,
 * the "mine only" convention the Courses pages already use extended with a second, always-visible
 * section so a first-time instructor has something concrete to look at (and duplicate) before
 * their own list has anything in it. Also the create-catalog flow (a button-triggered popup,
 * GitHub #359 follow-up, replacing the permanently visible inline form this page used to render
 * below the list).
 *
 * A catalog has no course of its own (activity_type_course, the table that used to link one
 * directly, is gone) — the "Used in" column instead shows how many assembled quizzes (GitHub
 * #360) currently reference it, which is the honest replacement: a catalog is only reachable by
 * students once composed into a quiz for a course, but which course(s) is a property of those
 * quizzes, not of the catalog itself.
 *
 * "Catalog" here and "quiz" in the code (this route, quizClient.ts, activity_type.quiz_name, …)
 * are the same concept — see CLAUDE.md's Question Catalogs section for why the user-facing name
 * changed but the underlying activity_type-backed plumbing from GitHub #347 didn't. Clicking a
 * row goes to app/instructor/quizzes/[activityType]/page.tsx, the catalog detail/edit view
 * (GitHub #359) that replaces the retired flat Question Bank page — an example catalog opens the
 * same page in its strictly read-only mode (GitHub #478).
 */
export default function InstructorQuizzesPage() {
  return (
    <Suspense fallback={null}>
      <InstructorQuizzesContent />
    </Suspense>
  );
}

function InstructorQuizzesContent() {
  const { token, profile, loading, authorized } = useRequireRole('instructor');
  const searchParams = useSearchParams();
  const fromCourseId = searchParams.get('courseId');

  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [exampleCatalogs, setExampleCatalogs] = useState<QuizSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<QuizSummary | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);

    loadQuizzes(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setQuizzes(result.data.quizzes);
        setExampleCatalogs(result.data.exampleCatalogs);
      } else {
        setLoadFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, retryCount]);

  const visibleQuizzes = quizzes ?? [];
  const visibleExamples = exampleCatalogs ?? [];

  if (loading || !authorized) return null;
  if (!token || !profile) return null;

  function handleCreated(quiz: CreatedQuiz) {
    // Optimistic insert: the caller is the quiz's creator_id, and its display name follows the
    // same first/last-name-else-username fallback GET /api/instructor/quizzes uses server-side —
    // no need to re-fetch the whole list just to show the one row that just changed.
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    const authorName = fullName || profile?.username || 'You';

    setQuizzes((current) => [
      {
        activityType: quiz.activityType,
        name: quiz.name,
        description: quiz.description,
        authorName,
        gradingKind: quiz.gradingKind,
        questionCount: 0,
        quizCount: 0,
        isBuiltIn: false,
      },
      ...(current ?? []),
    ]);

    setToastMessage(`"${quiz.name}" created.`);
    window.setTimeout(() => setToastMessage(null), TOAST_MS);
  }

  function handleDuplicated(quiz: DuplicatedQuiz) {
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    const authorName = fullName || profile?.username || 'You';

    setQuizzes((current) => [
      {
        activityType: quiz.activityType,
        name: quiz.name,
        description: quiz.description,
        authorName,
        gradingKind: quiz.gradingKind,
        questionCount: quiz.questionCount,
        quizCount: 0,
        isBuiltIn: false,
      },
      ...(current ?? []),
    ]);

    setDuplicateTarget(null);
    setToastMessage(`"${quiz.name}" duplicated to My Catalogs.`);
    window.setTimeout(() => setToastMessage(null), TOAST_MS);
  }

  return (
    <AppShell active="instructor-quizzes">
      <div className="mx-auto max-w-4xl">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Question Catalogs</h1>
            <p className="max-w-2xl text-sm font-semibold text-gray-500">
              Every question catalog you've created. Click a catalog to view its questions and edit it.
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
            Create catalog
          </button>
        </div>

        {fromCourseId ? (
          <div className="mb-5 mt-3 flex items-center gap-2.5 rounded-brand-md border border-brand-purple/30 bg-brand-purple/5 px-4 py-3 text-sm font-semibold text-brand-navy">
            Create a catalog, then&nbsp;
            <Link href={`/instructor/courses/${encodeURIComponent(fromCourseId)}`} className="font-extrabold text-brand-purple hover:underline">
              return to your course
            </Link>
            &nbsp;to assemble a quiz from it.
          </div>
        ) : null}

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

        {loadFailed ? (
          <div className="mb-6 mt-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load quizzes.</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : quizzes === null || exampleCatalogs === null ? (
          <p className="mb-6 mt-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            {/* GitHub #478: shown above "My Catalogs" and unconditionally, so a first-time
                instructor has something concrete to look at before they've created anything. */}
            <div className="mt-8">
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-gray-400">Example Catalogs</p>
              <p className="mb-3 text-xs font-semibold text-gray-500">
                Pre-built, ready-to-use catalogs. Browse them for reference, or duplicate one to start your own —
                the originals never change.
              </p>

              <div className="mb-8 overflow-x-auto rounded-brand-lg border border-brand-navy-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-brand-navy text-brand-ink-muted">
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Description</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Type</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Questions</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleExamples.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="bg-brand-navy-2 px-4 py-10 text-center text-sm font-semibold text-brand-ink-muted">
                          No example catalogs are available yet.
                        </td>
                      </tr>
                    ) : (
                      visibleExamples.map((quiz) => (
                        <tr key={quiz.activityType} className="border-t border-gray-100 bg-white transition hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3 font-extrabold text-brand-navy">
                            <Link
                              href={`/instructor/quizzes/${encodeURIComponent(quiz.activityType)}`}
                              className="inline-flex items-center gap-1.5 hover:text-brand-purple hover:underline"
                            >
                              <span className="text-gray-400">
                                <LockIcon />
                              </span>
                              {quiz.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{quiz.description || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <GradingKindBadge gradingKind={quiz.gradingKind} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-gray-600">{quiz.questionCount}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setDuplicateTarget(quiz)}
                              className="rounded-full border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-extrabold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple"
                            >
                              Duplicate
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-2">
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-gray-400">
                My Catalogs — {visibleQuizzes.length} catalog{visibleQuizzes.length === 1 ? '' : 's'}
              </p>

              <div className="mb-8 overflow-x-auto rounded-brand-lg border border-brand-navy-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="bg-brand-navy text-brand-ink-muted">
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Description</th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Type</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Used in</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Questions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleQuizzes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="bg-brand-navy-2 px-4 py-10 text-center text-sm font-semibold text-brand-ink-muted">
                          You haven't created any catalogs yet. Duplicate an example above to get started.
                        </td>
                      </tr>
                    ) : (
                      visibleQuizzes.map((quiz) => (
                        <tr key={quiz.activityType} className="border-t border-gray-100 bg-white transition hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3 font-extrabold text-brand-navy">
                            <Link href={`/instructor/quizzes/${encodeURIComponent(quiz.activityType)}`} className="hover:text-brand-purple hover:underline">
                              {quiz.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{quiz.description || '—'}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <GradingKindBadge gradingKind={quiz.gradingKind} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-gray-500">
                            {quiz.quizCount} quiz{quiz.quizCount === 1 ? '' : 'zes'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-gray-600">{quiz.questionCount}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {showCreateModal ? (
        <CreateCatalogModal token={token} onClose={() => setShowCreateModal(false)} onCreated={handleCreated} />
      ) : null}

      {duplicateTarget ? (
        <DuplicateCatalogModal
          catalog={duplicateTarget}
          token={token}
          onClose={() => setDuplicateTarget(null)}
          onCreated={handleDuplicated}
        />
      ) : null}
    </AppShell>
  );
}
