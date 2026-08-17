'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { JoinedCourseCard } from '../../components/JoinedCourseCard';
import { loadMyCourses } from '../../lib/studentCourseClient';
import type { JoinableCourse } from '../../lib/courseTypes';
import { useRequireRole } from '../../lib/useRequireRole';

/**
 * GitHub #427: "My Courses" — every course the student has joined, replacing the old flat
 * cross-course Activities list at this same route/nav slot (AppShell's 'activities' NavKey, kept
 * unchanged so nothing else has to be rewired). Clicking a course opens
 * app/courses/[id]/page.tsx, which lists that course's own quizzes — this page only answers
 * "which courses am I in," not "what do I need to do," the same split
 * app/courses/page.tsx (browse/join every course) already keeps from
 * app/instructor/courses/page.tsx (manage every course).
 *
 * Uses GET /api/courses/mine (lib/studentCourseClient.ts's loadMyCourses), not
 * loadJoinableCourses filtered by alreadyMember — see that route's own docblock for why a
 * codeless, instructor-assigned enrollment would otherwise go missing here.
 */
export default function MyCoursesPage() {
  const { token, profile, loading, authorized } = useRequireRole('student');

  const [courses, setCourses] = useState<JoinableCourse[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);

    loadMyCourses(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setCourses(result.data.courses);
      else setLoadFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [token, retryCount]);

  if (loading || !authorized) return null;
  if (!token || !profile) return null;

  return (
    <AppShell active="activities">
      <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">My Courses</h1>
      <p className="mb-6 max-w-2xl text-sm font-semibold text-gray-500">
        The courses you&apos;ve joined. Open one to see its quizzes.
      </p>

      {loadFailed ? (
        <div className="rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
          <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load your courses.</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
          >
            Retry
          </button>
        </div>
      ) : courses === null ? (
        <p className="text-sm font-semibold text-gray-500">Loading…</p>
      ) : courses.length === 0 ? (
        <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center text-sm font-semibold text-gray-500">
          You haven&apos;t joined a course yet.{' '}
          <Link href="/courses" className="font-bold text-brand-purple hover:underline">
            Browse courses
          </Link>{' '}
          to find yours and join with a code.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <JoinedCourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
