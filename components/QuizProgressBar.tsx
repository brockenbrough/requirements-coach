/**
 * The "Quiz progress" label-plus-bar on a course card — shared between components/CourseCard.tsx
 * (instructor: percent of the roster that's passed at least one of the course's quizzes) and
 * components/JoinedCourseCard.tsx (student: percent of the course's own quizzes this student has
 * passed, GitHub #435). Both callers own their loading-skeleton and null-percent-omits-the-bar
 * decisions themselves; this only ever renders the bar for an already-resolved percent.
 */
export function QuizProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs font-bold text-gray-500">
        <span>Quiz progress</span>
        <span className="tabular-nums text-brand-navy">{percent}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <span className="block h-full rounded-full bg-brand-teal" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
