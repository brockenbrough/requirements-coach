'use client';

import { useState } from 'react';
import { CopyCodeButton } from './CopyCodeButton';
import { createCourse, type Course } from '../lib/mockCourses';

/**
 * GitHub #241 (UI-1): create-a-course form + the resulting code, shown prominently for the
 * instructor to share with students. Submit-disabled-while-blank-or-in-flight follows the same
 * pattern as AcceptanceCriteriaWritingScreen (GitHub #149) and LLMProviderSettingsForm
 * (GitHub #150) — disabled until there's a non-blank name, label swaps to "Creating…" while the
 * (mock) request is in flight.
 */
export function CreateCourseForm({
  token,
  professorName,
  onCreated,
}: {
  token: string;
  /** The signed-in instructor's own display name — see lib/mockCourses.ts's createCourse docstring for why this comes from the caller instead of being looked up inside the mock. */
  professorName: string;
  onCreated?: (course: Course) => void;
}) {
  const [name, setName] = useState('');
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [course, setCourse] = useState<Course | null>(null);

  const canSubmit = Boolean(name.trim()) && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');

    // Blank input means open enrollment — Course.enrollmentKey is null, not an empty string.
    const result = await createCourse(token, name.trim(), professorName, enrollmentKey.trim() || null);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Cleared so a second course can be created right away — an instructor teaching more than
    // one section shouldn't need to leave and come back to this page.
    setCourse(result.data.course);
    setName('');
    setEnrollmentKey('');
    onCreated?.(result.data.course);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6">
        <label className="mb-1.5 block text-sm font-bold text-gray-600">
          Course name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Software Requirements — Fall 2026"
            className="mt-1.5 block w-full rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
          />
        </label>

        <label className="mb-1.5 mt-4 block text-sm font-bold text-gray-600">
          Enrollment key (optional)
          <input
            type="text"
            value={enrollmentKey}
            onChange={(event) => setEnrollmentKey(event.target.value)}
            placeholder="Leave empty for open enrollment"
            className="mt-1.5 block w-full rounded-brand-md border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
          />
        </label>

        {error ? <p className="mt-4 text-sm font-semibold text-brand-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 rounded-brand-md bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Creating…' : 'Create course'}
        </button>
      </form>

      {course ? (
        <div className="mt-5 rounded-brand-lg border border-brand-teal/40 bg-brand-teal/10 p-6 text-center">
          <p className="text-xs font-extrabold uppercase tracking-wide text-brand-teal-dark">{course.name}</p>
          <p className="mt-2 text-4xl font-extrabold tracking-[0.2em] text-brand-navy">{course.code}</p>
          <p className="mt-1.5 text-xs font-semibold text-gray-500">Share this code with your students so they can join.</p>
          <div className="mt-4 flex justify-center">
            <CopyCodeButton code={course.code} />
          </div>
        </div>
      ) : null}
    </>
  );
}
