import type { StudentAggregate } from '../lib/activityLogTypes';

/**
 * One student's card — shared by the Instructor Dashboard's roster preview and the All
 * Students page (GitHub #82) so the two never drift on what a student's summary looks like.
 * Purely presentational: callers decide what a click does (toggle a filter in place, or
 * navigate elsewhere).
 */
export function InstructorStudentCard({
  student,
  isSelected = false,
  onClick,
}: {
  student: StudentAggregate;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-brand-lg border p-4 text-left transition ${
        isSelected
          ? 'border-brand-purple bg-brand-purple/5'
          : student.needsAttention
            ? 'border-brand-danger/40 bg-brand-danger/5 hover:border-brand-danger'
            : 'border-gray-100 bg-gray-50 hover:border-brand-purple/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-extrabold text-brand-navy">{student.studentName}</span>
        {student.needsAttention ? (
          <span className="inline-flex flex-none items-center rounded-full bg-brand-danger/15 px-2 py-0.5 text-[11px] font-extrabold text-brand-danger">
            Needs attention
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs font-semibold text-gray-500">
        {student.attempts} attempt{student.attempts === 1 ? '' : 's'} · {student.abandonedCount} abandoned
      </p>
      <p className="mt-0.5 text-xs font-semibold text-gray-500">
        Average score: {student.averageScore === null ? '—' : `${student.averageScore}%`}
      </p>
    </button>
  );
}
