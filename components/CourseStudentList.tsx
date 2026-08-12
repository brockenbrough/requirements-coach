'use client';

import Link from 'next/link';
import type { CourseStudent } from '../lib/courseClient';

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </svg>
  );
}

/**
 * The roster for one course. Same card look as components/InstructorStudentCard.tsx, but
 * structured as a div wrapping a Link (the clickable "go to this student's detail page" area)
 * plus a separate Remove button, rather than reusing InstructorStudentCard directly — that
 * component is a single <Link> covering the whole card, which can't also host a button without
 * nesting interactive elements inside an <a>.
 */
export function CourseStudentList({
  students,
  onRemove,
}: {
  students: CourseStudent[];
  onRemove: (student: CourseStudent) => void;
}) {
  if (students.length === 0) {
    return (
      <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
        No students enrolled yet — add one below.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {students.map((student) => (
        <div
          key={student.id}
          className={`flex items-center gap-3 rounded-brand-lg border p-4 transition ${
            student.needsAttention ? 'border-brand-danger/40 bg-brand-danger/5' : 'border-gray-100 bg-gray-50'
          }`}
        >
          <Link
            href={`/instructor/students/${encodeURIComponent(student.id)}?name=${encodeURIComponent(student.name)}`}
            className="min-w-0 flex-1 hover:underline"
          >
            <div className="flex items-center gap-2">
              <span className="truncate font-extrabold text-brand-navy">{student.name}</span>
              {student.needsAttention ? (
                <span className="inline-flex flex-none items-center rounded-full bg-brand-danger/15 px-2 py-0.5 text-[11px] font-extrabold text-brand-danger">
                  Needs attention
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs font-semibold text-gray-500">
              {student.attempts} attempt{student.attempts === 1 ? '' : 's'} ·{' '}
              {student.averageScore === null ? 'no score yet' : `${student.averageScore}% avg`}
            </p>
          </Link>

          <button
            type="button"
            onClick={() => onRemove(student)}
            aria-label={`Remove ${student.name} from this course`}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition hover:border-brand-danger/40 hover:text-brand-danger"
          >
            <TrashIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
