'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { createQuiz, loadQuizzes, type QuizSummary } from '../../../lib/quizClient';
import { useRequireRole } from '../../../lib/useRequireRole';

const ALL_AUTHORS = 'all';

/**
 * GitHub #347: every quiz in the system (built-in or instructor-created), filterable by author,
 * plus the create-quiz form. Quizzes are globally shared — this list is not scoped to the
 * calling instructor, unlike the Question Bank or Courses pages.
 */
export default function InstructorQuizzesPage() {
  const { token, profile, loading, authorized } = useRequireRole('instructor');

  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [authorFilter, setAuthorFilter] = useState(ALL_AUTHORS);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);

    loadQuizzes(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setQuizzes(result.data.quizzes);
      else setLoadFailed(true);
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

  const canSubmit = Boolean(name.trim()) && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !token) return;

    setSubmitting(true);
    setCreateError('');

    const result = await createQuiz(token, {
      name: name.trim(),
      description: description.trim() || undefined,
    });

    setSubmitting(false);

    if (!result.ok) {
      setCreateError(result.error);
      return;
    }

    // Optimistic insert: the caller is the quiz's creator_id, and its display name follows the
    // same first/last-name-else-username fallback GET /api/instructor/quizzes uses server-side —
    // no need to re-fetch the whole list just to show the one row that just changed.
    const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
    const authorName = fullName || profile?.username || 'You';

    setQuizzes((current) => [
      ...(current ?? []),
      { activityType: result.data.quiz.activityType, name: result.data.quiz.name, description: result.data.quiz.description, authorName, questionCount: 0 },
    ]);

    setName('');
    setDescription('');
  }

  return (
    <AppShell active="instructor-quizzes">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Quizzes</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">
          Every quiz in the system, built-in or created by an instructor. Quizzes are shared — reuse a colleague's instead of rebuilding it.
        </p>

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
                {visibleQuizzes.length} quiz{visibleQuizzes.length === 1 ? '' : 'zes'}
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
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Questions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleQuizzes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="bg-brand-navy-2 px-4 py-10 text-center text-sm font-semibold text-brand-ink-muted">
                        No quizzes match this filter.
                      </td>
                    </tr>
                  ) : (
                    visibleQuizzes.map((quiz) => (
                      <tr key={quiz.activityType} className="border-t border-gray-100 bg-white">
                        <td className="whitespace-nowrap px-4 py-3 font-extrabold text-brand-navy">{quiz.name}</td>
                        <td className="px-4 py-3 text-gray-500">{quiz.description || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500">{quiz.authorName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-gray-600">{quiz.questionCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">Create a quiz</p>
        <form onSubmit={handleSubmit} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6">
          <label className="mb-1.5 block text-sm font-bold text-gray-600">
            Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Sprint Planning Basics"
              className="mt-1.5 block w-full rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
            />
          </label>

          <label className="mb-1.5 mt-4 block text-sm font-bold text-gray-600">
            Description <span className="font-semibold text-gray-400">(optional)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this quiz cover?"
              rows={3}
              className="mt-1.5 block w-full resize-none rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
            />
          </label>

          {createError ? <p className="mt-4 text-sm font-semibold text-brand-danger">{createError}</p> : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-5 rounded-brand-md bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Creating…' : 'Create quiz'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
