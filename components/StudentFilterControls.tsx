'use client';

import { COURSE_STUDENT_FILTER_OPTIONS, type CourseStudentFilter } from '../lib/courseStudentFilters';

const FIELD_STYLES = {
  light: 'border-gray-300 bg-white text-gray-600 focus:border-brand-purple',
  dark: 'border-brand-navy-border bg-brand-navy-2 text-brand-ink focus:border-brand-purple',
} as const;

const LABEL_STYLES = {
  light: 'text-gray-400',
  dark: 'text-brand-ink-muted',
} as const;

/**
 * The search box + filter dropdown shared by CourseStudentsDrawer and the full
 * course-students page (GitHub #378) — one component so the two can never render different
 * option labels for the same CourseStudentFilter value. filterAndSortCourseStudents
 * (lib/courseStudentFilters.ts) is what actually applies the selection; this only renders the
 * controls and reports changes upward.
 */
export function StudentFilterControls({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  variant = 'light',
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filter: CourseStudentFilter;
  onFilterChange: (value: CourseStudentFilter) => void;
  variant?: 'light' | 'dark';
}) {
  const fieldClass = `mt-1 block w-full rounded-brand-md border px-3.5 py-2 text-sm font-bold outline-none transition ${FIELD_STYLES[variant]}`;
  const labelClass = `block text-xs font-extrabold uppercase tracking-wide ${LABEL_STYLES[variant]}`;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <label className={`flex-1 ${labelClass}`}>
        Search
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by name…"
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Filter
        <select value={filter} onChange={(event) => onFilterChange(event.target.value as CourseStudentFilter)} className={fieldClass}>
          {COURSE_STUDENT_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
