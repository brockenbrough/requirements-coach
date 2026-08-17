import Link from 'next/link';
import { resolveCourseCoverSrc } from '../lib/courseCovers';
import type { JoinableCourse } from '../lib/courseTypes';

/**
 * One course on the student's "My Courses" page (GitHub #427, app/activities/page.tsx) — the same
 * Moodle-style cover-image/name/semester-badge look as components/CourseCard.tsx (instructor) and
 * components/StudentCourseCard.tsx (browse/join), but a third, deliberately separate component:
 * every course here is already joined by definition, so there's no Join/Leave affordance to
 * render — the whole card is just a Link into that course's quiz list
 * (app/courses/[id]/page.tsx), the "click into a course to see its quizzes" the issue asks for.
 * Leaving a course is still only available from the browse page (app/courses/page.tsx),
 * unchanged.
 */
export function JoinedCourseCard({ course }: { course: JoinableCourse }) {
  return (
    <Link
      href={`/courses/${encodeURIComponent(course.id)}`}
      className="block overflow-hidden rounded-brand-lg border border-gray-100 bg-white shadow-sm transition hover:border-brand-purple/40 hover:shadow-md"
    >
      {/* Plain <img>, not next/image — see components/CourseCard.tsx's own comment on why. */}
      <div className="relative h-28 w-full overflow-hidden bg-brand-navy sm:h-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolveCourseCoverSrc(course)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>

      <div className="p-4">
        <p className="line-clamp-1 font-extrabold text-brand-navy">{course.name}</p>

        {course.semester ? (
          <span className="mt-1.5 inline-flex items-center rounded-full bg-brand-purple/10 px-2.5 py-0.5 text-xs font-bold text-brand-purple">
            {course.semester}
          </span>
        ) : null}

        <p className="mt-2.5 text-xs font-semibold text-gray-500">
          {course.professorName} · {course.studentCount} student{course.studentCount === 1 ? '' : 's'}
        </p>
      </div>
    </Link>
  );
}
