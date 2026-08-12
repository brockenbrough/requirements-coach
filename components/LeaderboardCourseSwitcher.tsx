'use client';

import type { LeaderboardCourse } from '../lib/leaderboardTypes';

// Above this many courses the pill row wraps into an unreadable block, so it becomes a select.
// Same threshold reasoning as ActivityFilters' choice of control per filter.
const MAX_PILLS = 4;

/**
 * Picks which course's ranking is shown. The selection lives in the URL (?courseId=), not in
 * component state — the page owns that, this component only reports the change — so a
 * leaderboard view stays linkable and survives a reload.
 */
export function LeaderboardCourseSwitcher({
  courses,
  selectedCourseId,
  onSelect,
}: {
  courses: LeaderboardCourse[];
  selectedCourseId: string | null;
  onSelect: (courseId: string) => void;
}) {
  // One course is not a choice — the heading already says which one it is.
  if (courses.length <= 1) return null;

  if (courses.length > MAX_PILLS) {
    return (
      <label className="mb-5 block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Course</span>
        <select
          value={selectedCourseId ?? ''}
          onChange={(event) => onSelect(event.target.value)}
          className="w-full max-w-xs rounded-brand-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-brand-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple"
        >
          {courses.map((course) => (
            <option key={course.courseId} value={course.courseId}>
              {course.courseName}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Course">
      {courses.map((course) => {
        const isSelected = course.courseId === selectedCourseId;
        return (
          <button
            key={course.courseId}
            type="button"
            onClick={() => onSelect(course.courseId)}
            aria-pressed={isSelected}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple ${
              isSelected
                ? 'border-brand-purple bg-brand-purple text-white'
                : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
            }`}
          >
            {course.courseName}
          </button>
        );
      })}
    </div>
  );
}
