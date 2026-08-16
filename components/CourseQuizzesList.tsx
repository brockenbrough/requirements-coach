import Link from 'next/link';
import type { AssembledQuizSummary } from '../lib/assembledQuizClient';

/**
 * A course's assigned quizzes (GitHub #360, course detail page section added in a #362
 * follow-up) — same card/list look as CourseStudentList.tsx so the page's two sections
 * (participants, content) read as one design system rather than two. Each row links straight to
 * the quiz's own existing detail page (app/instructor/assembled-quizzes/[quizId]/page.tsx,
 * GitHub #360/#361) rather than duplicating any composition UI here — this is a read-only summary,
 * the same relationship CourseCard has to the course detail page it links into.
 */
export function CourseQuizzesList({ quizzes }: { quizzes: AssembledQuizSummary[] }) {
  if (quizzes.length === 0) {
    return (
      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center">
        <p className="mb-4 text-sm font-semibold text-gray-500">No quizzes assigned to this course yet.</p>
        <Link
          href="/instructor/assembled-quizzes"
          className="inline-flex items-center rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
        >
          Go to Quizzes
        </Link>
      </div>
    );
  }

  return (
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
  );
}
