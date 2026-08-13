'use client';

import type { CourseSummary } from '../lib/courseClient';

/**
 * Picks which course an instructor screen is showing (GitHub #275, REQ-PL-3.3).
 *
 * REQ-PL-3.3 asks for a class *code* to be entered. The code stayed what it is — the thing a
 * student types to join — because course ownership is already in the schema (course.creator_id,
 * REQ-DL-5): the instructor's own courses can simply be listed, so there is nothing for them to
 * remember or retype.
 *
 * A plain <select> rather than the pill row components/LeaderboardCourseSwitcher.tsx falls back
 * from: an instructor's course count grows every semester, so the control that survives ten
 * courses is the only one worth having here.
 *
 * The selection itself lives in the URL (?courseId=), not in this component — see
 * lib/useCourseScope.ts. This only reports the change.
 */
export function CourseScopeSelect({
  courses,
  selectedCourseId,
  onSelect,
}: {
  courses: CourseSummary[];
  selectedCourseId: string | null;
  onSelect: (courseId: string) => void;
}) {
  // One course is not a choice — showing a select with a single locked option is noise, and the
  // page heading already says which class this is.
  if (courses.length <= 1) return null;

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-gray-400">Course</span>
      <select
        value={selectedCourseId ?? ''}
        onChange={(event) => onSelect(event.target.value)}
        className="block w-full max-w-xs rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
      >
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.name} ({course.studentCount})
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * What an instructor screen shows instead of an empty table when they have no courses yet.
 * Distinct from "this course has no activity": nothing on these pages can work without a course,
 * so the only useful thing to render is the way to create one.
 */
export function NoCoursesNotice() {
  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center">
      <p className="mb-1.5 text-sm font-extrabold text-brand-navy">No courses yet</p>
      <p className="mb-4 text-sm font-semibold text-gray-500">
        Student activity is shown per course. Create one, then share its code so students can join.
      </p>
      <a
        href="/instructor/courses"
        className="inline-block rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
      >
        Create a course
      </a>
    </div>
  );
}
