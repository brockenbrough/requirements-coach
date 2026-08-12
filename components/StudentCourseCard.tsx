'use client';

import { useState } from 'react';
import { joinCourseByCode } from '../lib/studentCourseClient';
import type { JoinableCourse } from '../lib/courseTypes';

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * GitHub #242 (UI-2): one course on the student-facing browse/join page. Same card look as
 * components/CourseCard.tsx (the instructor's version — rounded-brand-lg, border-gray-100/
 * bg-gray-50) but a distinct component rather than a shared one: this card's action is "join",
 * that one's is "go manage this course as its instructor" — different audiences, different data.
 *
 * The join code is a secret the instructor hands out directly — this card never sees or
 * displays it (JoinableCourse has no code field at all), only submits whatever the student
 * types. POST /api/courses/join resolves the course purely from that code, server-side, so a
 * successful join's onJoined(courseId) uses the id the *server* confirms, not necessarily this
 * row's — a typo'd-but-still-valid code for a different course would otherwise silently mark
 * the wrong card as joined.
 */
export function StudentCourseCard({
  course,
  token,
  onJoined,
}: {
  course: JoinableCourse;
  token: string;
  onJoined: (courseId: string) => void;
}) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [codeInputOpen, setCodeInputOpen] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');

  async function handleJoin(code: string) {
    if (joining) return;

    setJoining(true);
    setError('');

    const result = await joinCourseByCode(token, code);
    setJoining(false);

    if (!result.ok) {
      setError(result.error);
      return; // input stays open so the student can immediately retry
    }

    setCodeInputOpen(false);
    setEnteredCode('');
    onJoined(result.data.course.id);
  }

  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-4">
      <span className="font-extrabold text-brand-navy">{course.name}</span>
      <p className="mt-1.5 text-xs font-semibold text-gray-500">
        {course.professorName} · {course.studentCount} student{course.studentCount === 1 ? '' : 's'}
      </p>

      {error ? <p className="mt-2 text-xs font-semibold text-brand-danger">{error}</p> : null}

      <div className="mt-3.5">
        {course.alreadyMember ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal/20 px-4 py-2 text-sm font-extrabold text-brand-teal-dark">
            <CheckIcon />
            Joined
          </span>
        ) : codeInputOpen ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleJoin(enteredCode);
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              type="text"
              value={enteredCode}
              onChange={(event) => setEnteredCode(event.target.value)}
              placeholder="Course code"
              autoFocus
              className="rounded-brand-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none transition focus:border-brand-purple"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!enteredCode.trim() || joining}
                className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                {joining ? 'Joining…' : 'Join'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeInputOpen(false);
                  setEnteredCode('');
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
            onClick={() => setCodeInputOpen(true)}
            className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
          >
            Join
          </button>
        )}
      </div>
    </div>
  );
}
