'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadJoinableCourses } from '../lib/studentCourseClient';
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
 */
export function MyCoursesSection({ token }: { token: string }) {
  const [courses, setCourses] = useState<JoinableCourse[] | null>(null);

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
            <li key={course.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-brand-navy">{course.name}</p>
                <p className="text-xs font-semibold text-gray-500">{course.professorName}</p>
              </div>
              <span className="flex-none text-xs font-extrabold tracking-[0.1em] text-brand-purple">{course.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
