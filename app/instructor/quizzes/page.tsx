'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { CreateCatalogModal } from '../../../components/CreateCatalogModal';
import { loadCourses } from '../../../lib/courseClient';
import type { CourseSummary } from '../../../lib/courseTypes';
import { loadQuizzes, type QuizSummary } from '../../../lib/quizClient';
import { useRequireRole } from '../../../lib/useRequireRole';

const ALL_AUTHORS = 'all';
const TOAST_MS = 3200;

/**
 * GitHub #347/#359: every question catalog in the system (built-in or instructor-created),
 * filterable by author, plus the create-catalog flow (a button-triggered popup, GitHub #359
 * follow-up, replacing the permanently visible inline form this page used to render below the
 * list). Catalogs are globally shared — this list is not scoped to the calling instructor,
 * unlike the old Question Bank or the Courses pages.
 *
 * "Catalog" here and "quiz" in the code (this route, quizClient.ts, activity_type.quiz_name, …)
 * are the same concept — see CLAUDE.md's Question Catalogs section for why the user-facing name
 * changed but the underlying activity_type-backed plumbing from GitHub #347 didn't. Clicking a
 * row goes to app/instructor/quizzes/[activityType]/page.tsx, the catalog detail/edit view
 * (GitHub #359) that replaces the retired flat Question Bank page.
 */
export default function InstructorQuizzesPage() {
  const { token, profile, loading, authorized } = useRequireRole('instructor');

  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [authorFilter, setAuthorFilter] = useState(ALL_AUTHORS);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);

    loadQuizzes(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setQuizzes(result.data.quizzes);
      else setLoadFailed(true);
    });

    // The create-catalog form needs the instructor's own courses for its now-required course
    // picker (every activity_type is linked to exactly one course) — a failure here just leaves
    // the picker empty rather than blocking the whole page, the same "a title costs a title, not
    // the whole page" pattern app/activities/page.tsx uses for loadStudentTitles.
    loadCourses(token).then((result) => {
      if (!cancelled && result.ok) setCourses(result.data.courses);
    });

    return () => {
      cancelled = true;
    };
  }, [token, retryCount]);

  const authors = useMemo(() => {
    const names = new Set((quizzes ?? []).map((quiz) => quiz.authorName));
    return Array.from(names).sort();
  }, [quizzes]);

  const visibleQuizzes = (quizzes ?? []).filter(
    (quiz) => authorFilter === ALL_AUTHORS || quiz.authorName === authorFilter,
  );

  if (loading || !authorized) return null;
  if (!token || !profile) return null;

  function handleCreated(quiz: { activityType: string; name: string; description: string | null; courseId: string; courseName: string }) {
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
        questionCount: 0,
        courseId: quiz.courseId,
        courseName: quiz.courseName,
      },
      ...(current ?? []),
    ]);

    setToastMessage(`"${quiz.name}" created.`);
    window.setTimeout(() => setToastMessage(null), TOAST_MS);
  }

  return (
    <AppShell active="instructor-quizzes">
      <div className="mx-auto max-w-4xl">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Question Catalogs</h1>
            <p className="max-w-2xl text-sm font-semibold text-gray-500">
              Every question catalog in the system, built-in or created by an instructor. Catalogs are shared — reuse a
              colleague's instead of rebuilding it. Click a catalog to view its questions and edit it.
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
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load quizzes.</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : quizzes === null ? (
          <p className="mb-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-gray-400">
                {visibleQuizzes.length} catalog{visibleQuizzes.length === 1 ? '' : 's'}
              </p>

              <label className="flex items-center gap-2 text-xs font-bold text-gray-500">
                Author
                <select
                  value={authorFilter}
                  onChange={(event) => setAuthorFilter(event.target.value)}
                  className="rounded-brand-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 outline-none transition focus:border-brand-purple"
                >
                  <option value={ALL_AUTHORS}>All authors</option>
                  {authors.map((author) => (
                    <option key={author} value={author}>
                      {author}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mb-8 overflow-x-auto rounded-brand-lg border border-brand-navy-border">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-brand-navy text-brand-ink-muted">
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Description</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Author</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Course</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Questions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQuizzes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="bg-brand-navy-2 px-4 py-10 text-center text-sm font-semibold text-brand-ink-muted">
                        No catalogs match this filter.
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
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500">{quiz.authorName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                          {quiz.courseName ?? <span className="italic text-gray-400">Not linked yet</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-gray-600">{quiz.questionCount}</td>
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

      {showCreateModal ? (
        <CreateCatalogModal token={token} courses={courses} onClose={() => setShowCreateModal(false)} onCreated={handleCreated} />
      ) : null}
    </AppShell>
  );
}
