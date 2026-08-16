'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CourseStudent } from '../lib/courseClient';
import { filterAndSortCourseStudents, type CourseStudentFilter } from '../lib/courseStudentFilters';
import { CourseStudentList } from './CourseStudentList';
import { StudentFilterControls } from './StudentFilterControls';
import { useModalDismiss } from './useModalDismiss';

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/**
 * The course detail page's roster (GitHub #378 "UI: Change Course View") — moved off the main
 * content area into a right-docked drawer so the page's primary focus can be the course's
 * quizzes. Same overlay/ESC/backdrop-click chrome as every centered modal in this app
 * (useModalDismiss, z-50, bg-black/70-ish backdrop) — see that hook's own docblock for why it's
 * reusable here unchanged (behavior only, no positioning assumptions); only `justify-end` instead
 * of `items-center justify-center` docks the panel to the right edge instead of centering it.
 *
 * Reuses CourseStudentList/CourseStudentRow with variant="dark" rather than a second copy of the
 * row markup — the drawer sits on the app's dark modal surface (bg-brand-navy), not the light
 * content area CourseStudentList originally rendered on, so only the color tokens differ.
 * StudentFilterControls and filterAndSortCourseStudents are the exact same two pieces the full
 * course-students page (app/instructor/courses/[id]/students/page.tsx) uses, so "Needs attention"
 * or "No attempts yet" can't mean something different in the drawer than on that page.
 *
 * "Add student" here doesn't own AddStudentModal itself — it calls back to the parent page
 * (onOpenAddStudent), which already owns that modal's open state and the onAdded handler that
 * updates the shared `course` state this drawer's own `students` prop is derived from. That keeps
 * the drawer open underneath the modal (both z-50; the caller renders this drawer before
 * AddStudentModal in the DOM so the modal — mounted after — paints above it), so the drawer's own
 * search/filter state survives adding a student instead of being torn down and rebuilt.
 */
export function CourseStudentsDrawer({
  courseId,
  students,
  onClose,
  onRemove,
  onOpenAddStudent,
}: {
  courseId: string;
  students: CourseStudent[];
  onClose: () => void;
  onRemove: (student: CourseStudent) => void;
  onOpenAddStudent: () => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CourseStudentFilter>('all');

  const { panelRef, requestClose } = useModalDismiss<HTMLDivElement>({ onClose });

  const filtered = filterAndSortCourseStudents(students, { query, filter });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-students-drawer-title"
        className="flex h-full w-full max-w-sm flex-col border-l border-brand-navy-border bg-brand-navy p-6"
      >
        <div className="mb-4 flex flex-none items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Roster</p>
            <h2 id="course-students-drawer-title" className="mt-1 text-xl font-extrabold text-white">
              Students ({students.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white"
          >
            <CloseIcon />
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenAddStudent}
          className="mb-4 flex flex-none items-center justify-center gap-1.5 rounded-full bg-brand-purple px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
        >
          <PlusIcon />
          Add student
        </button>

        <div className="flex-none">
          <StudentFilterControls query={query} onQueryChange={setQuery} filter={filter} onFilterChange={setFilter} variant="dark" />
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          <CourseStudentList
            students={filtered}
            onRemove={onRemove}
            variant="dark"
            emptyMessage={query || filter !== 'all' ? 'No students match.' : 'No students enrolled yet.'}
          />
        </div>

        <Link
          href={`/instructor/courses/${encodeURIComponent(courseId)}/students`}
          className="mt-4 block flex-none rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2.5 text-center text-sm font-extrabold text-white transition hover:border-brand-purple"
        >
          View all students
        </Link>
      </div>
    </div>
  );
}
