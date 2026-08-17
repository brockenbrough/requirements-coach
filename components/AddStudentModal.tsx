'use client';

import { useEffect, useState } from 'react';
import { addStudentToCourse, type CourseStudent } from '../lib/courseClient';
import { loadInstructorStudents, type StudentSummary } from '../lib/sessionClient';
import { clearCachedInstructorStudents } from '../lib/instructorStudentsStore';
import { useModalDismiss } from './useModalDismiss';

function studentDisplayName(student: StudentSummary): string {
  const fullName = [student.firstName, student.lastName].filter(Boolean).join(' ').trim();
  return fullName || student.username;
}

/**
 * The popup that adds a student to a course — replaces the permanently visible AddStudentForm
 * that used to render below the roster: with a large class, a search form that's always on
 * screen just adds scroll without adding value, the same reasoning that moved course creation
 * behind CreateCourseModal (GitHub #241 follow-up). Same overlay/close-icon/ESC/backdrop-click
 * chrome as CreateCourseModal/DuplicateCourseModal/CreateCatalogModal via useModalDismiss.
 *
 * The search-and-suggest logic itself is unchanged from AddStudentForm.tsx (now deleted, this is
 * its replacement) — there is still no dedicated "search students" endpoint, so this still fetches
 * the whole class roster once (loadInstructorStudents, already real and cached) and filters
 * client-side by name/username substring, excluding ids already in enrolledIds.
 *
 * Deliberately stays open after a successful add, unlike CreateCourseModal's one-shot flow:
 * enrolling students is typically a batch action (an instructor pasting in a new semester's
 * roster one name at a time), and closing after every single add would force reopening the popup
 * once per student. The search field clears and a brief inline confirmation shows instead, so the
 * next name can be searched immediately. enrolledIds is threaded through by the parent from its
 * own course state, which updates on every onAdded call — so an already-added student drops out
 * of suggestions right away without this component tracking its own copy of the roster.
 */
export function AddStudentModal({
  token,
  instructorId,
  courseId,
  enrolledIds,
  onClose,
  onAdded,
}: {
  token: string;
  instructorId: string;
  courseId: string;
  enrolledIds: string[];
  onClose: () => void;
  onAdded: (student: CourseStudent) => void;
}) {
  const [query, setQuery] = useState('');
  const [roster, setRoster] = useState<StudentSummary[]>([]);
  const [suggestions, setSuggestions] = useState<StudentSummary[]>([]);
  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const { panelRef, firstFieldRef, requestClose } = useModalDismiss<HTMLDivElement, HTMLInputElement>({
    onClose,
    isBlocked: adding,
  });

  useEffect(() => {
    let cancelled = false;
    // scope: 'all' — this search must be able to find a student who isn't enrolled in any of the
    // instructor's courses yet (the whole point of enrolling someone new), so it deliberately opts
    // out of GET /api/instructor/students' now-scoped default.
    loadInstructorStudents(token, instructorId, { scope: 'all' }).then((result) => {
      if (!cancelled && result.ok) setRoster(result.data.students);
    });
    return () => {
      cancelled = true;
    };
  }, [token, instructorId]);

  useEffect(() => {
    const displayName = selected ? studentDisplayName(selected) : null;
    if (!query.trim() || (selected && displayName === query)) {
      setSuggestions([]);
      return;
    }

    const q = query.trim().toLowerCase();
    setSuggestions(
      roster.filter(
        (s) => !enrolledIds.includes(s.userId) && (studentDisplayName(s).toLowerCase().includes(q) || s.username.toLowerCase().includes(q)),
      ),
    );
  }, [query, roster, enrolledIds, selected]);

  function handleSelect(student: StudentSummary) {
    setSelected(student);
    setQuery(studentDisplayName(student));
    setSuggestions([]);
    setJustAdded(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || adding) return;
    if (enrolledIds.includes(selected.userId)) {
      setError('This student is already in the course.');
      return;
    }

    setAdding(true);
    setError('');

    const result = await addStudentToCourse(token, courseId, selected.userId);
    setAdding(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // The instructor's scoped roster (GET /api/instructor/students, default scope) now includes
    // this student — clear the cache so /instructor/students and the dashboard pick it up on
    // their next load instead of showing the pre-enrollment list for the rest of the tab session,
    // same precedent as clearing leaderboardCoursesStore when a student joins a course.
    clearCachedInstructorStudents();
    onAdded(result.data.student);
    setJustAdded(result.data.student.name);
    setQuery('');
    setSelected(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-student-title"
        className="w-full max-w-md rounded-brand-lg border border-brand-navy-border bg-brand-navy p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-brand-gold">Roster</p>
            <h2 id="add-student-title" className="mt-1 text-xl font-extrabold text-white">
              Add Student
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={adding}
            aria-label="Close"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-brand-navy-border bg-brand-navy-2 text-brand-ink-muted transition hover:text-white disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-brand-ink-muted">
            Student
            <div className="relative">
              <input
                ref={firstFieldRef}
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected(null);
                  setJustAdded(null);
                }}
                placeholder="Search by name…"
                className="mt-1.5 block w-full rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-3.5 py-2.5 text-sm font-semibold text-brand-ink outline-none transition focus:border-brand-purple"
              />
              {suggestions.length > 0 ? (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-brand-md border border-brand-navy-border bg-brand-navy-2 shadow-lg">
                  {suggestions.map((student) => (
                    <button
                      key={student.userId}
                      type="button"
                      onClick={() => handleSelect(student)}
                      className="block w-full px-3.5 py-2.5 text-left text-sm font-semibold text-brand-ink hover:bg-brand-navy"
                    >
                      {studentDisplayName(student)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </label>

          {justAdded ? <p className="mt-3 text-xs font-bold text-brand-teal">{justAdded} added.</p> : null}
          {error ? <p className="mt-3 text-xs font-bold text-brand-danger">{error}</p> : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={requestClose}
              disabled={adding}
              className="rounded-brand-md border border-brand-navy-border bg-brand-navy-2 px-4 py-2 text-sm font-extrabold text-brand-ink-muted transition hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selected || adding}
              className="rounded-brand-md bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
