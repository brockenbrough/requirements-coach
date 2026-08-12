'use client';

import { useEffect, useRef, useState } from 'react';
import { addStudentToCourse, type CourseStudent } from '../lib/courseClient';
import { loadInstructorStudents, type StudentSummary } from '../lib/sessionClient';

function studentDisplayName(student: StudentSummary): string {
  const fullName = [student.firstName, student.lastName].filter(Boolean).join(' ').trim();
  return fullName || student.username;
}

/**
 * GitHub #241 follow-up: search-and-add form for a course's roster. Fully real
 * (lib/courseClient.ts, REQ-DL-5) — there is no dedicated "search students" endpoint, so this
 * fetches the whole class roster via loadInstructorStudents (lib/sessionClient.ts, already real
 * and cached — GET /api/instructor/students) once and filters it client-side by name/username
 * substring, the same way it always filtered out already-enrolled ids. Suggestions already
 * exclude students currently enrolled (enrolledIds), which is what actually prevents adding a
 * duplicate in practice; the submit handler still checks again before calling the API, since
 * addStudentToCourse is the real validation boundary, not this component's own filtering.
 */
export function AddStudentForm({
  token,
  instructorId,
  courseId,
  enrolledIds,
  onAdded,
}: {
  token: string;
  instructorId: string;
  courseId: string;
  enrolledIds: string[];
  onAdded: (student: CourseStudent) => void;
}) {
  const [query, setQuery] = useState('');
  const [roster, setRoster] = useState<StudentSummary[]>([]);
  const [suggestions, setSuggestions] = useState<StudentSummary[]>([]);
  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const latestQueryRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    loadInstructorStudents(token, instructorId).then((result) => {
      if (!cancelled && result.ok) setRoster(result.data.students);
    });
    return () => {
      cancelled = true;
    };
  }, [token, instructorId]);

  useEffect(() => {
    latestQueryRef.current = query;

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

    onAdded(result.data.student);
    setQuery('');
    setSelected(null);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
      <label className="mb-1.5 block text-sm font-bold text-gray-600">
        Add a student
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            placeholder="Search by name…"
            className="mt-1.5 block w-full rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
          />
          {suggestions.length > 0 ? (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-brand-md border border-gray-200 bg-white shadow-lg">
              {suggestions.map((student) => (
                <button
                  key={student.userId}
                  type="button"
                  onClick={() => handleSelect(student)}
                  className="block w-full px-3.5 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {studentDisplayName(student)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </label>

      {error ? <p className="mt-3 text-sm font-semibold text-brand-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={!selected || adding}
        className="mt-4 rounded-brand-md bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {adding ? 'Adding…' : 'Add student'}
      </button>
    </form>
  );
}
