import Link from 'next/link';
import type { CourseSummary } from '../lib/courseClient';

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/**
 * One course, on the Courses overview page — same card look as
 * components/InstructorStudentCard.tsx (rounded-brand-lg, border-gray-100/bg-gray-50, hover
 * lift) so the two surfaces read as one design system rather than two.
 *
 * onDuplicate (GitHub #362) is optional and renders a small icon button in the card's corner,
 * sibling to the Link rather than nested inside it — a <button> inside the <a> Link would be
 * invalid HTML (interactive-in-interactive) and unreliable to click. preventDefault/
 * stopPropagation on its own click keep the card's navigation from firing at the same time, so an
 * instructor can duplicate a course straight from the list without opening its detail page first.
 */
export function CourseCard({ course, onDuplicate }: { course: CourseSummary; onDuplicate?: (course: CourseSummary) => void }) {
  return (
    <div className="group relative rounded-brand-lg border border-gray-100 bg-gray-50 p-4 transition hover:border-brand-purple/40">
      <Link href={`/instructor/courses/${encodeURIComponent(course.id)}`} className="block pr-8 text-left">
        <span className="font-extrabold text-brand-navy">{course.name}</span>
        <p className="mt-1.5 text-xs font-semibold tracking-[0.15em] text-brand-purple">{course.code}</p>
        <p className="mt-1.5 text-xs font-semibold text-gray-500">
          {course.studentCount} student{course.studentCount === 1 ? '' : 's'}
        </p>
      </Link>
      {onDuplicate ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDuplicate(course);
          }}
          aria-label={`Duplicate ${course.name}`}
          title="Duplicate course"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition hover:border-brand-purple hover:text-brand-purple"
        >
          <DuplicateIcon />
        </button>
      ) : null}
    </div>
  );
}
