import type { CourseClassStats as CourseClassStatsData } from '../lib/courseClient';

/**
 * Total students / started / passed, for one course (GitHub #315). Shared across the Instructor
 * Dashboard's "My Courses" cards, the course detail page header, and the course browse-list cards
 * — grid layout (not flex) so it holds up in both a narrow card and a wider header without a
 * size/variant prop. Visual language matches components/StatTile.tsx.
 *
 * stats === null means "not loaded yet" and renders placeholder tiles — deliberately not the
 * `value > 0 ? … : '—'` idiom InstructorActivityStats.tsx uses elsewhere, since that can't tell
 * "loading" apart from a genuine 0%.
 */
export function CourseClassStats({ stats }: { stats: CourseClassStatsData | null }) {
  if (stats === null) {
    return (
      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-brand-lg border border-gray-100 bg-gray-50 p-3 text-center">
            <div className="mx-auto h-6 w-10 rounded bg-gray-200" />
            <div className="mx-auto mt-1.5 h-3 w-14 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    );
  }

  const emptyMessage =
    stats.totalStudents === 0 ? 'No students enrolled yet.' : !stats.hasQuizzes ? 'No quizzes assigned to this course yet.' : null;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-3 text-center">
        <div className="text-xl font-extrabold tabular-nums text-brand-navy">{stats.totalStudents}</div>
        <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-400">Students</div>
      </div>

      {emptyMessage ? (
        <div className="col-span-2 flex items-center justify-center rounded-brand-lg border border-gray-100 bg-gray-50 p-3 text-center">
          <p className="text-xs font-semibold text-gray-500">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-3 text-center">
            <div className="text-xl font-extrabold tabular-nums text-brand-navy">{stats.startedPercent}%</div>
            <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-400">
              Started · {stats.startedCount} of {stats.totalStudents}
            </div>
          </div>
          <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-3 text-center">
            <div className="text-xl font-extrabold tabular-nums text-brand-teal-dark">{stats.passedPercent}%</div>
            <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-400">
              Passed · {stats.passedCount} of {stats.totalStudents}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
