import Link from 'next/link';
import type { AssembledQuizSummary } from '../lib/assembledQuizClient';

/**
 * GitHub #467: the empty state used to send an instructor with no quizzes yet to the Question
 * Catalogs page first (via a "Choose question catalogs" link into /instructor/quizzes) — the
 * wrong destination, since composing a quiz is what this course actually needs and catalogs are
 * only an ingredient of that (CreateQuizModal already lists/filters them). The single entry
 * point is now the "+" button next to the Quizzes heading, which opens the Create Quiz popup
 * (components/CreateQuizModal.tsx) pre-scoped to this course, regardless of whether any catalog
 * is linked yet — the modal itself says "No catalogs of this type exist yet." when none are.
 */
export function CourseQuizzesList({
  quizzes,
  onAddQuiz,
}: {
  quizzes: AssembledQuizSummary[];
  onAddQuiz: () => void;
}) {
  const uniqueCatalogs = [
    ...new Map(
      quizzes.flatMap((q) => q.catalogs).map((c) => [c.activityType, c]),
    ).values(),
  ];

  const hasCatalogs = uniqueCatalogs.length > 0;

  return (
    <>
      {hasCatalogs ? (
        <div className="mb-8">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">
            Question Catalogs ({uniqueCatalogs.length})
          </p>
          <div className="flex flex-col gap-2.5">
            {uniqueCatalogs.map((catalog) => (
              <Link
                key={catalog.activityType}
                href={`/instructor/quizzes/${encodeURIComponent(catalog.activityType)}`}
                className="block rounded-brand-lg border border-gray-100 bg-gray-50 p-4 transition hover:border-brand-purple/40"
              >
                <span className="font-extrabold text-brand-navy">{catalog.name}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-gray-400">
          Quizzes {quizzes.length > 0 ? `(${quizzes.length})` : ''}
        </p>
        <button
          type="button"
          onClick={onAddQuiz}
          className="flex flex-none items-center gap-2 rounded-full bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create quiz
        </button>
      </div>

      {quizzes.length === 0 ? (
        <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center">
          <p className="text-sm font-semibold text-gray-500">No quizzes assigned to this course yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {quizzes.map((quiz) => (
            <Link
              key={quiz.id}
              href={`/instructor/assembled-quizzes/${encodeURIComponent(quiz.id)}`}
              className="block rounded-brand-lg border border-gray-100 bg-gray-50 p-4 transition hover:border-brand-purple/40"
            >
              <span className="font-extrabold text-brand-navy">{quiz.name}</span>
              {quiz.description ? <p className="mt-1 text-xs font-semibold text-gray-500">{quiz.description}</p> : null}
              <p className="mt-1.5 text-xs font-semibold text-gray-500">
                {quiz.catalogNames.length} catalog{quiz.catalogNames.length === 1 ? '' : 's'}
                {quiz.catalogNames.length > 0 ? ` — ${quiz.catalogNames.join(', ')}` : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
