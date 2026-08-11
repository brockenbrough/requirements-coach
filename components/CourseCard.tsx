import Link from 'next/link';
import type { Course } from '../lib/mockCourses';

/**
 * One course, on the Courses overview page — same card look as
 * components/InstructorStudentCard.tsx (rounded-brand-lg, border-gray-100/bg-gray-50, hover
 * lift) so the two surfaces read as one design system rather than two.
 */
export function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/instructor/courses/${encodeURIComponent(course.id)}`}
      className="block rounded-brand-lg border border-gray-100 bg-gray-50 p-4 text-left transition hover:border-brand-purple/40"
    >
      <span className="font-extrabold text-brand-navy">{course.name}</span>
      <p className="mt-1.5 text-xs font-semibold tracking-[0.15em] text-brand-purple">{course.code}</p>
      <p className="mt-1.5 text-xs font-semibold text-gray-500">
        {course.studentIds.length} student{course.studentIds.length === 1 ? '' : 's'}
      </p>
    </Link>
  );
}
