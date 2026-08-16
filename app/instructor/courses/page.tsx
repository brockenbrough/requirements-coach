'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { CourseCard } from '../../../components/CourseCard';
import { CreateCourseModal } from '../../../components/CreateCourseModal';
import { DuplicateCourseModal } from '../../../components/DuplicateCourseModal';
import { loadCourses, type CourseSummary } from '../../../lib/courseClient';
import { useRequireRole } from '../../../lib/useRequireRole';

/**
 * GitHub #241 (UI-1) + follow-up: instructor "Courses" overview — every course the instructor
 * has created, plus the create-course flow. Real now (lib/courseClient.ts, REQ-DL-5) — GET
 * /api/instructor/courses backs this list, scoped to the caller's own courses server-side.
 *
 * Create-course flow: a button-triggered popup (components/CreateCourseModal.tsx), replacing the
 * permanently visible inline form this page used to render below the list — same button-plus-popup
 * pattern app/instructor/quizzes/page.tsx (catalogs) and app/instructor/assembled-quizzes/page.tsx
 * (quizzes) use, for visual consistency across all three instructor overview pages.
 */
export default function InstructorCoursesPage() {
  // Same guard as every other /instructor/* page (GitHub #82/#169) — a student hitting this
  // URL directly is redirected, never shown the courses list or create form.
  const { token, profile, loading, authorized } = useRequireRole('instructor');

  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<CourseSummary | null>(null);

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
  if (!token || !profile) return null;

  return (
    <AppShell active="instructor-courses">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Courses</h1>
            <p className="max-w-2xl text-sm font-semibold text-gray-500">
              Create a course and share its code with your students so they can join.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex flex-none items-center gap-2 rounded-full bg-brand-purple px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create course
          </button>
        </div>

        <p className="mb-3 mt-6 text-xs font-extrabold uppercase tracking-wide text-gray-400">Your courses</p>

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
            You haven&apos;t created a course yet — use the button above to get started.
          </p>
        ) : (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} onDuplicate={setDuplicateSource} />
            ))}
          </div>
        )}
      </div>

      {showCreateModal ? (
        <CreateCourseModal
          token={token}
          onClose={() => setShowCreateModal(false)}
          onCreated={(course) => setCourses((current) => [course, ...(current ?? [])])}
        />
      ) : null}

      {duplicateSource ? (
        <DuplicateCourseModal
          course={duplicateSource}
          token={token}
          onClose={() => setDuplicateSource(null)}
          onCreated={(course) => setCourses((current) => [course, ...(current ?? [])])}
        />
      ) : null}
    </AppShell>
  );
}
