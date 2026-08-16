'use client';

import type { CourseStudent } from '../lib/courseClient';
import { CourseStudentRow } from './CourseStudentRow';

/**
 * The roster for one course. Delegates each row to CourseStudentRow (GitHub #378) — this
 * component now only owns the empty state and the list wrapper, which is layout-agnostic enough
 * to drop into either surface that renders it: the course detail page's old always-visible
 * section, the full course-students page, and CourseStudentsDrawer (with variant="dark").
 */
export function CourseStudentList({
  students,
  onRemove,
  variant = 'light',
  emptyMessage = 'No students enrolled yet — add one above.',
}: {
  students: CourseStudent[];
  onRemove: (student: CourseStudent) => void;
  variant?: 'light' | 'dark';
  emptyMessage?: string;
}) {
  if (students.length === 0) {
    return (
      <p
        className={`rounded-brand-lg border p-6 text-center text-sm font-semibold ${
          variant === 'dark' ? 'border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted' : 'border-gray-100 bg-gray-50 text-gray-500'
        }`}
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {students.map((student) => (
        <CourseStudentRow key={student.id} student={student} onRemove={onRemove} variant={variant} />
      ))}
    </div>
  );
}
