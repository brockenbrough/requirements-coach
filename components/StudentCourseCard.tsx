'use client';

import { useState } from 'react';
import { joinCourse, type Course } from '../lib/mockCourses';

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * GitHub #242 (UI-2) + follow-up (enrollment key): one course on the student-facing browse/join
 * page. Same card look as components/CourseCard.tsx (the instructor's version — rounded-brand-lg,
 * border-gray-100/bg-gray-50) but a distinct component rather than a shared one: this card's
 * action is "join", that one's is "go manage this course as its instructor" — different
 * audiences, different data, not just a style variant.
 *
 * `!!course.enrollmentKey` gates the whole extra step below — a course without one joins in one
 * click exactly as before this field existed; only key-protected courses reveal the input.
 */
export function StudentCourseCard({
  course,
  token,
  studentId,
  onJoined,
}: {
  course: Course;
  token: string;
  studentId: string;
  onJoined: (course: Course) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [keyInputOpen, setKeyInputOpen] = useState(false);
  const [enteredKey, setEnteredKey] = useState('');

  const alreadyJoined = course.studentIds.includes(studentId);
  const requiresKey = Boolean(course.enrollmentKey);

  async function handleJoin(enrollmentKey?: string) {
    if (joining) return;

    setJoining(true);
    setError('');

    const result = await joinCourse(token, course.id, studentId, enrollmentKey);
    setJoining(false);

    if (!result.ok) {
      setError(result.error);
      return; // key input (if open) stays open so the student can immediately retry
    }

    setKeyInputOpen(false);
    setEnteredKey('');
    onJoined(result.data.course);
  }

  function handleJoinClick() {
    if (requiresKey) {
      setKeyInputOpen(true);
      return;
    }
    void handleJoin();
  }

  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-4">
      <span className="font-extrabold text-brand-navy">{course.name}</span>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-[0.15em] text-brand-purple">{course.code}</span>
        {requiresKey ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-brand-gold/25 px-2 py-0.5 text-[11px] font-extrabold text-brand-gold-dark"
            title="Requires an enrollment key from your instructor"
          >
            <LockIcon />
            Requires key
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs font-semibold text-gray-500">
        {course.professorName} · {course.studentIds.length} student{course.studentIds.length === 1 ? '' : 's'}
      </p>

      {error ? <p className="mt-2 text-xs font-semibold text-brand-danger">{error}</p> : null}

      <div className="mt-3.5">
        {alreadyJoined ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal/20 px-4 py-2 text-sm font-extrabold text-brand-teal-dark">
            <CheckIcon />
            Joined
          </span>
        ) : keyInputOpen ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleJoin(enteredKey);
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              type="text"
              value={enteredKey}
              onChange={(event) => setEnteredKey(event.target.value)}
              placeholder="Enrollment key"
              autoFocus
              className="rounded-brand-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!enteredKey.trim() || joining}
                className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {joining ? 'Joining…' : 'Join'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setKeyInputOpen(false);
                  setEnteredKey('');
                  setError('');
                }}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-600 transition hover:border-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={handleJoinClick}
            disabled={joining}
            className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {joining ? 'Joining…' : 'Join'}
          </button>
        )}
      </div>
    </div>
  );
}
