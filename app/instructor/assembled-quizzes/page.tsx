'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { createAssembledQuiz, loadAssembledQuizzes, type AssembledQuizSummary } from '../../../lib/assembledQuizClient';
import { loadCourses, type CourseSummary } from '../../../lib/courseClient';
import { loadQuizzes, type QuizSummary } from '../../../lib/quizClient';
import { useRequireRole } from '../../../lib/useRequireRole';

/**
 * GitHub #360: compose a quiz from one or more question catalogs (GitHub #347/#359) for one of
 * the instructor's own courses (GitHub #241). Deliberately a different page/nav item from
 * "Question Catalogs" (app/instructor/quizzes/page.tsx) — see CLAUDE.md for why the two "quiz"
 * concepts in this codebase aren't the same table. This page only composes a quiz (which
 * catalogs, which course); it does not yet let a student take one — that's the natural next step,
 * once a session route knows how to draw from an assembled_quiz's catalogs
 * (lib/assembledQuizQueries.ts's pickRandomQuestions/loadCatalogQuestionPool are ready for it).
 */
export default function InstructorAssembledQuizzesPage() {
  const { token, loading, authorized } = useRequireRole('instructor');

  const [quizzes, setQuizzes] = useState<AssembledQuizSummary[] | null>(null);
  const [catalogs, setCatalogs] = useState<QuizSummary[] | null>(null);
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [courseId, setCourseId] = useState('');
  const [selectedCatalogs, setSelectedCatalogs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadFailed(false);

    Promise.all([loadAssembledQuizzes(token), loadQuizzes(token), loadCourses(token)]).then(
      ([quizzesResult, catalogsResult, coursesResult]) => {
        if (cancelled) return;
        if (quizzesResult.ok && catalogsResult.ok && coursesResult.ok) {
          setQuizzes(quizzesResult.data.quizzes);
          setCatalogs(catalogsResult.data.quizzes);
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

  function toggleCatalog(activityType: string) {
    setSelectedCatalogs((current) =>
      current.includes(activityType) ? current.filter((id) => id !== activityType) : [...current, activityType],
    );
  }

  const canSubmit = Boolean(name.trim()) && Boolean(courseId) && selectedCatalogs.length > 0 && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !token) return;

    setSubmitting(true);
    setCreateError('');

    const result = await createAssembledQuiz(token, {
      name: name.trim(),
      description: description.trim() || undefined,
      courseId,
      catalogActivityTypes: selectedCatalogs,
    });

    setSubmitting(false);

    if (!result.ok) {
      setCreateError(result.error);
      return;
    }

    // Optimistic insert, same reasoning as app/instructor/quizzes/page.tsx's create form: the
    // response only echoes ids, but the course/catalog names needed to render the new row are
    // already in this page's own state.
    const course = (courses ?? []).find((c) => c.id === courseId);
    const catalogNames = selectedCatalogs
      .map((activityType) => (catalogs ?? []).find((c) => c.activityType === activityType)?.name)
      .filter((catalogName): catalogName is string => Boolean(catalogName));

    setQuizzes((current) => [
      {
        id: result.data.quiz.id,
        name: result.data.quiz.name,
        description: result.data.quiz.description,
        courseId: result.data.quiz.courseId,
        courseName: course?.name ?? 'Unknown course',
        catalogNames,
        createdAt: new Date().toISOString(),
      },
      ...(current ?? []),
    ]);

    setName('');
    setDescription('');
    setCourseId('');
    setSelectedCatalogs([]);
  }

  return (
    <AppShell active="instructor-assembled-quizzes">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Quizzes</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">
          Compose a quiz from one or more question catalogs for one of your courses. Each difficulty level draws its
          questions at random from every selected catalog, fresh for every attempt.
        </p>

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
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Course</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">Catalogs</th>
                  </tr>
                </thead>
                <tbody>
                  {quizzes.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="bg-brand-navy-2 px-4 py-10 text-center text-sm font-semibold text-brand-ink-muted">
                        You haven&apos;t created a quiz yet.
                      </td>
                    </tr>
                  ) : (
                    quizzes.map((quiz) => (
                      <tr key={quiz.id} className="border-t border-gray-100 bg-white">
                        <td className="whitespace-nowrap px-4 py-3 font-extrabold text-brand-navy">{quiz.name}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500">{quiz.courseName}</td>
                        <td className="px-4 py-3 text-gray-500">{quiz.catalogNames.join(', ') || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">Create a quiz</p>
            <form onSubmit={handleSubmit} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6">
              <label className="mb-1.5 block text-sm font-bold text-gray-600">
                Name
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Sprint 1 Requirements Check"
                  className="mt-1.5 block w-full rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
                />
              </label>

              <label className="mb-1.5 mt-4 block text-sm font-bold text-gray-600">
                Description <span className="font-semibold text-gray-400">(optional)</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What is this quiz for?"
                  rows={2}
                  className="mt-1.5 block w-full resize-none rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
                />
              </label>

              <label className="mb-1.5 mt-4 block text-sm font-bold text-gray-600">
                Course
                <select
                  value={courseId}
                  onChange={(event) => setCourseId(event.target.value)}
                  className="mt-1.5 block w-full rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
                >
                  <option value="">Select a course…</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
              {courses.length === 0 ? (
                <p className="mt-1.5 text-xs font-semibold text-gray-500">
                  You don&apos;t have any courses yet — create one on the Courses page first.
                </p>
              ) : null}

              <span className="mb-1.5 mt-4 block text-sm font-bold text-gray-600">Catalogs</span>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-brand-md border border-gray-300 bg-white p-3">
                {catalogs.length === 0 ? (
                  <p className="text-xs font-semibold text-gray-500">No catalogs exist yet.</p>
                ) : (
                  catalogs.map((catalog) => (
                    <label key={catalog.activityType} className="flex items-center gap-2.5 text-sm font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedCatalogs.includes(catalog.activityType)}
                        onChange={() => toggleCatalog(catalog.activityType)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-purple focus:ring-brand-purple"
                      />
                      {catalog.name}
                      <span className="text-xs font-semibold text-gray-400">({catalog.questionCount} questions)</span>
                    </label>
                  ))
                )}
              </div>

              {createError ? <p className="mt-4 text-sm font-semibold text-brand-danger">{createError}</p> : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-5 rounded-brand-md bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Creating…' : 'Create quiz'}
              </button>
            </form>
          </>
        )}
      </div>
    </AppShell>
  );
}
