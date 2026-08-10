'use client';

import { useState } from 'react';
import { InstructorStudentCard } from './InstructorStudentCard';
import type { StudentAggregate } from '../lib/activityLogTypes';

// Matches the 3-column grid below: 6 cards is exactly two full rows on desktop, so the
// collapsed view never ends on an awkward partial row.
const INITIAL_VISIBLE_COUNT = 6;

/**
 * The class roster: one card per student, flagging low average scores or repeated abandons so
 * "who needs help" (the literal goal of GitHub #82's user story) reads at a glance rather than
 * requiring a scan of every row in the attempts table. Each card links to that student's detail
 * page (GitHub #127) — selectedStudentId still highlights whichever student the Student filter
 * below is currently set to (via InstructorFilters' dropdown), it just no longer changes from
 * clicking a card here now that a card click navigates instead. For the full class, see
 * app/instructor/students/page.tsx instead.
 *
 * Collapsed to INITIAL_VISIBLE_COUNT by default — a real class can run well past what's
 * comfortable to scan at once, and summarizeStudents already put the students most worth
 * seeing (needs-attention) first, so truncating the list doesn't hide them.
 */
export function InstructorRoster({
  students,
  selectedStudentId,
}: {
  students: StudentAggregate[];
  selectedStudentId: string;
}) {
  const [showAllStudents, setShowAllStudents] = useState(false);

  const hasMore = students.length > INITIAL_VISIBLE_COUNT;
  const visibleStudents = showAllStudents ? students : students.slice(0, INITIAL_VISIBLE_COUNT);

  return (
    <div className="mb-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleStudents.map((student) => (
          <InstructorStudentCard key={student.studentId} student={student} isSelected={selectedStudentId === student.studentId} />
        ))}
      </div>

      {hasMore ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAllStudents((value) => !value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition hover:border-gray-300"
          >
            {showAllStudents ? 'Show less' : `View more students (${students.length - INITIAL_VISIBLE_COUNT} more)`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
