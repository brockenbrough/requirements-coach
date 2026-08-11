'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { AddStudentForm } from '../../../../components/AddStudentForm';
import { CopyCodeButton } from '../../../../components/CopyCodeButton';
import { CourseStudentList } from '../../../../components/CourseStudentList';
import { EditCourseModal } from '../../../../components/EditCourseModal';
import {
  getMockCourseStudent,
  loadCourse,
  removeStudentFromCourse,
  type Course,
  type MockCourseStudent,
} from '../../../../lib/mockCourses';
import { useRequireRole } from '../../../../lib/useRequireRole';

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
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
 * GitHub #241 follow-up: one course's detail view — code + roster management. Backend doesn't
 * exist yet, so this runs on lib/mockCourses.ts; see that file's header for what a real
 * integration needs to swap in.
 */
export default function CourseDetailPage({ params }: { params: { id: string } }) {
  // Same guard as every other /instructor/* page (GitHub #82/#169) — a student hitting this
  // URL directly is redirected, never shown the roster or edit/remove controls.
  const { token, loading, authorized } = useRequireRole('instructor');

  const [course, setCourse] = useState<Course | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);

    loadCourse(token, params.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setCourse(result.data.course);
      else setLoadFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [token, params.id, retryCount]);

  // Resolves enrolled ids into display info — undefined entries (an id with no directory match)
  // are filtered out rather than rendered as a broken row.
  const students = useMemo<MockCourseStudent[]>(
    () => (course?.studentIds ?? []).map((id) => getMockCourseStudent(id)).filter((s): s is MockCourseStudent => Boolean(s)),
    [course?.studentIds],
  );

  if (loading || !authorized) return null;
  if (!token) return null;

  async function handleRemove(student: MockCourseStudent) {
    if (!course) return;
    if (!confirm(`Remove ${student.name} from this course?`)) return;

    setError('');
    // token is already checked non-null above this point in the render (guards return null
    // otherwise); TS doesn't carry that narrowing into this nested function declaration.
    const result = await removeStudentFromCourse(token!, course.id, student.id);
    if (result.ok) setCourse(result.data.course);
    else setError(result.error);
  }

  return (
    <AppShell active="instructor-courses">
      <div className="mx-auto max-w-2xl">
        <Link href="/instructor/courses" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy">
          ← Back to Courses
        </Link>

        {loadFailed ? (
          <div className="rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load this course.</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="rounded-full bg-brand-purple px-5 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : course === null ? (
          <p className="text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-brand-navy">{course.name}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tracking-[0.15em] text-brand-purple">{course.code}</span>
                  {course.enrollmentKey ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-brand-gold/25 px-2.5 py-0.5 text-[11px] font-extrabold text-brand-gold-dark"
                      title="Students need the enrollment key to join"
                    >
                      <LockIcon />
                      Key required
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-none items-center gap-3">
                <CopyCodeButton code={course.code} />
                <button
                  type="button"
                  onClick={() => setEditModalOpen(true)}
                  aria-label="Edit course"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-purple hover:text-brand-purple"
                >
                  <EditIcon />
                </button>
              </div>
            </div>

            {error ? <p className="mb-4 text-sm font-semibold text-brand-danger">{error}</p> : null}

            <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">
              Students ({students.length})
            </p>
            <div className="mb-6">
              <CourseStudentList students={students} onRemove={handleRemove} />
            </div>

            <AddStudentForm
              token={token}
              course={course}
              enrolledIds={course.studentIds}
              onAdded={(updated) => {
                setError('');
                setCourse(updated);
              }}
            />
          </>
        )}
      </div>

      {editModalOpen && course ? (
        <EditCourseModal
          course={course}
          token={token}
          onClose={() => setEditModalOpen(false)}
          onSaved={(updated) => setCourse(updated)}
        />
      ) : null}
    </AppShell>
  );
}
