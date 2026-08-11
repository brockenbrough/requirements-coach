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
 * Real now (lib/studentCourseClient.ts, REQ-DL-5) — join hits POST /api/courses/join with the
 * course's own code, no enrollment-key step: that concept has no column anywhere in the real
 * schema (course_code's nullability is REQ-DL-5's actual answer to open vs. instructor-assigned
 * enrollment), so there was never a real gate for a key to unlock.
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

  async function handleJoin() {
    if (joining) return;

    setJoining(true);
    setError('');

    const result = await joinCourseByCode(token, course.code);
    setJoining(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onJoined(course.id);
  }

  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-4">
      <span className="font-extrabold text-brand-navy">{course.name}</span>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-[0.15em] text-brand-purple">{course.code}</span>
      </div>
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
        ) : (
          <button
            type="button"
            onClick={handleJoin}
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
