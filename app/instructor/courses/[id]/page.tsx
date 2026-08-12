'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { AddStudentForm } from '../../../../components/AddStudentForm';
import { CopyCodeButton } from '../../../../components/CopyCodeButton';
import { CourseStudentList } from '../../../../components/CourseStudentList';
import { EditCourseModal } from '../../../../components/EditCourseModal';
import { exportCourseReport, loadCourse, removeStudentFromCourse, type CourseDetail, type CourseStudent } from '../../../../lib/courseClient';
import { useRequireRole } from '../../../../lib/useRequireRole';

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

/**
 * GitHub #241 follow-up: one course's detail view — code + roster management. Fully real
 * (lib/courseClient.ts, REQ-DL-5): GET /api/instructor/courses/{id} already embeds the roster
 * with attempt/score summaries, so there's no separate per-student lookup here.
 */
export default function CourseDetailPage({ params }: { params: { id: string } }) {
  // Same guard as every other /instructor/* page (GitHub #82/#169) — a student hitting this
  // URL directly is redirected, never shown the roster or edit/remove controls.
  const { token, profile, loading, authorized } = useRequireRole('instructor');

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

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

  if (loading || !authorized) return null;
  if (!token || !profile) return null;

  async function handleRemove(student: CourseStudent) {
    if (!course) return;
    if (!confirm(`Remove ${student.name} from this course?`)) return;

    setError('');
    // token is already checked non-null above this point in the render (guards return null
    // otherwise); TS doesn't carry that narrowing into this nested function declaration.
    const result = await removeStudentFromCourse(token!, course.id, student.id);
    if (result.ok) {
      setCourse((current) => (current ? { ...current, students: current.students.filter((s) => s.id !== student.id) } : current));
    } else {
      setError(result.error);
    }
  }

  async function handleExport() {
    if (!course || exporting) return;

    setError('');
    setExporting(true);
    const result = await exportCourseReport(token!, course.id);
    setExporting(false);
    if (!result.ok) setError(result.error);
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
                </div>
              </div>
              <div className="flex flex-none items-center gap-3">
                <CopyCodeButton code={course.code} />
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className="inline-flex items-center gap-2 rounded-full border border-brand-teal/40 bg-white px-4 py-2 text-sm font-extrabold text-brand-teal-dark transition hover:border-brand-teal disabled:opacity-60"
                >
                  <DownloadIcon />
                  {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
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
              Students ({course.students.length})
            </p>
            <div className="mb-6">
              <CourseStudentList students={course.students} onRemove={handleRemove} />
            </div>

            <AddStudentForm
              token={token}
              instructorId={profile.user_id}
              courseId={course.id}
              enrolledIds={course.students.map((s) => s.id)}
              onAdded={(student) => {
                setError('');
                setCourse((current) => (current ? { ...current, students: [...current.students, student] } : current));
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
          onSaved={(updated) => setCourse((current) => (current ? { ...current, name: updated.name, code: updated.code } : current))}
        />
      ) : null}
    </AppShell>
  );
}
