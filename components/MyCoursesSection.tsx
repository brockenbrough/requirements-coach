'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { leaveCourse, loadJoinableCourses } from '../lib/studentCourseClient';
import type { JoinableCourse } from '../lib/courseTypes';

/**
 * GitHub #242 (UI-2): persistent "which courses am I in" display — the profile page half of the
 * issue's requirement 5 (sidebar and/or profile; this app went with profile, since the sidebar
 * is already tight on space and a growing course list wouldn't fit it well). Same
 * "border-t pt-6, uppercase label" section style as the Change Password block right above it on
 * app/profile/page.tsx, so it reads as one more section of that page, not a bolted-on widget.
 *
 * Real now (lib/studentCourseClient.ts, REQ-DL-5) — filters on course.alreadyMember, which the
 * server already scopes to the caller's own token, rather than a client-side studentId
 * comparison against an embedded roster.
 *
 * Leave action (GitHub #324): window.confirm() rather than a dedicated modal, the same
 * lightweight convention components/ResumeOrAbandonPrompt.tsx already uses for a single-course,
 * self-only consequence — no roster/enrollment-count context to show, unlike
 * components/DeleteCourseModal.tsx's instructor-facing delete. On success the course is dropped
 * from local state immediately (no re-fetch needed, mirrors app/courses/page.tsx's handleJoined),
 * and leaveCourse itself clears the session-cached leaderboard course list/entries so the
 * dashboard and leaderboard pick up the change on next visit too.
 */
export function MyCoursesSection({ token }: { token: string }) {
  const [courses, setCourses] = useState<JoinableCourse[] | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    loadJoinableCourses(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setCourses(result.data.courses.filter((course) => course.alreadyMember));
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleLeave(course: JoinableCourse) {
    if (leavingId) return;
    if (!confirm(`Leave ${course.name}? You can rejoin later with the course code.`)) return;

    setError('');
    setLeavingId(course.id);

    const result = await leaveCourse(token, course.id);

    setLeavingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setCourses((current) => current?.filter((c) => c.id !== course.id) ?? current);
  }

  return (
    <div className="mt-8 border-t border-gray-100 pt-6">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">My Courses</p>

      {courses === null ? (
        <p className="mt-3 text-sm font-semibold text-gray-500">Loading…</p>
      ) : courses.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-gray-500">
          You haven&apos;t joined a course yet.{' '}
          <Link href="/courses" className="text-brand-purple hover:underline">
            Browse courses
          </Link>
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {courses.map((course) => (
            <li
              key={course.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-brand-navy">{course.name}</p>
                <p className="text-xs font-semibold text-gray-500">{course.professorName}</p>
              </div>
              <button
                type="button"
                onClick={() => handleLeave(course)}
                disabled={leavingId === course.id}
                className="flex-none text-xs font-extrabold text-brand-danger hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              >
                {leavingId === course.id ? 'Leaving…' : 'Leave'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="mt-3 text-xs font-bold text-brand-danger">{error}</p> : null}
    </div>
  );
}
