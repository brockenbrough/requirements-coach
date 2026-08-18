import Link from 'next/link';
import { resolveCourseCoverSrc } from '../lib/courseCovers';
import type { CourseQuizProgress } from '../lib/studentCourseClient';
import type { JoinableCourse } from '../lib/courseTypes';
import { QuizProgressBar } from './QuizProgressBar';

/**
 * One course on the student's "My Courses" page (GitHub #427, app/activities/page.tsx) — the same
 * Moodle-style cover-image/name/semester-badge look as components/CourseCard.tsx (instructor) and
 * components/StudentCourseCard.tsx (browse/join), but a third, deliberately separate component:
 * every course here is already joined by definition, so there's no Join/Leave affordance to
 * render — the whole card is just a Link into that course's quiz list
 * (app/courses/[id]/page.tsx), the "click into a course to see its quizzes" the issue asks for.
 * Leaving a course is still only available from the browse page (app/courses/page.tsx),
 * unchanged.
 *
 * quizProgress (GitHub #435) is this student's own "N% of this course's quizzes passed" — the
 * individual counterpart to CourseCard.tsx's classStats bar, which measures the whole roster
 * instead. `null` means the fetch is still in flight (a loading placeholder, never a misleading
 * "0%" flash); once loaded, the bar itself only renders when the course actually has quizzes to
 * divide by, same as CourseCard.tsx's own progressPercent gate. Required (not optional/undefined)
 * because this is the only place JoinedCourseCard is used, and that caller always fetches it.
 *
 * Deliberately doesn't show course.studentCount the way CourseCard.tsx (instructor) and
 * StudentCourseCard.tsx (browse/join) do — a student's own card is about their own progress in
 * the course, not the size of the roster around them.
 */
export function JoinedCourseCard({ course, quizProgress }: { course: JoinableCourse; quizProgress: CourseQuizProgress | null }) {
  const progressPercent = quizProgress && quizProgress.hasQuizzes ? quizProgress.progressPercent : null;

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

        {quizProgress === null ? (
          <div className="mt-3" aria-hidden="true">
            <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
            <div className="mt-1.5 h-1.5 w-full animate-pulse rounded-full bg-gray-100" />
          </div>
        ) : progressPercent !== null ? (
          <QuizProgressBar percent={progressPercent} />
        ) : null}

        <p className="mt-2.5 text-xs font-semibold text-gray-500">{course.professorName}</p>
      </div>
    </Link>
  );
}
