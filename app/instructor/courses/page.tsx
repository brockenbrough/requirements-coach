'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { CourseCard } from '../../../components/CourseCard';
import { CreateCourseForm } from '../../../components/CreateCourseForm';
import { loadCourses, type Course } from '../../../lib/mockCourses';
import { useRequireRole } from '../../../lib/useRequireRole';

/**
 * GitHub #241 (UI-1) + follow-up: instructor "Courses" overview — every course the instructor
 * has created, plus the create-course form. Backend (API-1 and friends) doesn't exist yet, so
 * this runs on lib/mockCourses.ts; see that file's header for exactly what a real integration
 * needs to swap in.
 */
export default function InstructorCoursesPage() {
  // Same guard as every other /instructor/* page (GitHub #82/#169) — a student hitting this
  // URL directly is redirected, never shown the courses list or create form.
  const { token, loading, authorized } = useRequireRole('instructor');

  const [courses, setCourses] = useState<Course[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);

    loadCourses(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setCourses(result.data.courses);
      else setLoadFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [token, retryCount]);

  if (loading || !authorized) return null;
  if (!token) return null;

  return (
    <AppShell active="instructor-courses">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Courses</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">
          Create a course and share its code with your students so they can join.
        </p>

        <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">Your courses</p>

        {loadFailed ? (
          <div className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
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
          <p className="mb-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : courses.length === 0 ? (
          <p className="mb-6 rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
            You haven&apos;t created a course yet — do that below.
          </p>
        ) : (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}

        <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">Create a course</p>
        <CreateCourseForm token={token} onCreated={(course) => setCourses((current) => [course, ...(current ?? [])])} />
      </div>
    </AppShell>
  );
}
