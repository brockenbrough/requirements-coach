import Link from 'next/link';
import type { AssembledQuizSummary } from '../lib/assembledQuizClient';

export function CourseQuizzesList({ quizzes, courseId }: { quizzes: AssembledQuizSummary[]; courseId: string }) {
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

      <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">
        Quizzes {quizzes.length > 0 ? `(${quizzes.length})` : ''}
      </p>

      {quizzes.length === 0 ? (
        <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center">
          {hasCatalogs ? (
            <>
              <p className="mb-4 text-sm font-semibold text-gray-500">No quizzes assigned to this course yet.</p>
              <Link
                href="/instructor/assembled-quizzes"
                className="inline-flex items-center rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
              >
                Go to Quizzes
              </Link>
            </>
          ) : (
            <>
              <p className="mb-1 text-sm font-extrabold text-brand-navy">Start with a question catalog</p>
              <p className="mb-4 text-sm font-semibold text-gray-500">
                Link a question catalog to this course before assembling a quiz.
              </p>
              <Link
                href={`/instructor/quizzes?courseId=${encodeURIComponent(courseId)}`}
                className="inline-flex items-center rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
              >
                Choose question catalogs
              </Link>
            </>
          )}
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
