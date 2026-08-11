'use client';

import { useEffect, useRef, useState } from 'react';
import { addStudentToCourse, searchMockStudents, type Course, type MockCourseStudent } from '../lib/mockCourses';

/**
 * GitHub #241 follow-up: search-and-add form for a course's roster. Suggestions already exclude
 * students currently enrolled (enrolledIds), which is what actually prevents adding a duplicate
 * in practice; the submit handler still checks again before calling the API, since
 * addStudentToCourse is the real validation boundary, not this component's own filtering.
 */
export function AddStudentForm({
  token,
  course,
  enrolledIds,
  onAdded,
}: {
  token: string;
  course: Course;
  enrolledIds: string[];
  onAdded: (course: Course) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<MockCourseStudent[]>([]);
  const [selected, setSelected] = useState<MockCourseStudent | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const latestQueryRef = useRef('');

  useEffect(() => {
    latestQueryRef.current = query;

    if (!query.trim() || (selected && selected.name === query)) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    searchMockStudents(token, query).then((result) => {
      if (cancelled || latestQueryRef.current !== query) return; // superseded by newer typing
      if (result.ok) setSuggestions(result.data.students.filter((s) => !enrolledIds.includes(s.id)));
    });

    return () => {
      cancelled = true;
    };
  }, [query, token, enrolledIds, selected]);

  function handleSelect(student: MockCourseStudent) {
    setSelected(student);
    setQuery(student.name);
    setSuggestions([]);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || adding) return;
    if (enrolledIds.includes(selected.id)) {
      setError('This student is already in the course.');
      return;
    }

    setAdding(true);
    setError('');

    const result = await addStudentToCourse(token, course.id, selected.id);
    setAdding(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onAdded(result.data.course);
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
                  key={student.id}
                  type="button"
                  onClick={() => handleSelect(student)}
                  className="block w-full px-3.5 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {student.name}
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
