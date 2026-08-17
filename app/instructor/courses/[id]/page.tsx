'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { AddStudentModal } from '../../../../components/AddStudentModal';
import { CopyCodeButton } from '../../../../components/CopyCodeButton';
import { CourseQuizzesList } from '../../../../components/CourseQuizzesList';
import { CourseStudentsDrawer } from '../../../../components/CourseStudentsDrawer';
import { DeleteCourseModal } from '../../../../components/DeleteCourseModal';
import { DuplicateCourseModal } from '../../../../components/DuplicateCourseModal';
import { EditCourseModal } from '../../../../components/EditCourseModal';
import {
  exportCourseReport,
  loadCourse,
  loadCourseQuizzes,
  loadCourseClassStats,
  removeStudentFromCourse,
  type CourseDetail,
  type CourseStudent,
  type CourseSummary,
  type CourseClassStats as CourseClassStatsData,
} from '../../../../lib/courseClient';
import { CourseClassStats } from '../../../../components/CourseClassStats';
import type { AssembledQuizSummary } from '../../../../lib/assembledQuizClient';
import { clearCachedInstructorStudents } from '../../../../lib/instructorStudentsStore';
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
  const router = useRouter();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicatedCourse, setDuplicatedCourse] = useState<CourseSummary | null>(null);
  const [addStudentModalOpen, setAddStudentModalOpen] = useState(false);
  const [studentsDrawerOpen, setStudentsDrawerOpen] = useState(false);
  const [quizzes, setQuizzes] = useState<AssembledQuizSummary[] | null>(null);
  const [quizzesLoadFailed, setQuizzesLoadFailed] = useState(false);
  const [quizzesRetryCount, setQuizzesRetryCount] = useState(0);
  const [classStats, setClassStats] = useState<CourseClassStatsData | null>(null);
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

  // A separate, independent load: the Quizzes section (GitHub #362 follow-up) has nothing to do
  // with the roster/course-meta fetch above, so a failure here shouldn't block the rest of the
  // page, and its own Retry only refires this effect.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setQuizzesLoadFailed(false);

    loadCourseQuizzes(token, params.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setQuizzes(result.data.quizzes);
      else setQuizzesLoadFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [token, params.id, quizzesRetryCount]);

  // Also independent (GitHub #315): class engagement has nothing to do with the roster fetch or
  // the Quizzes section above, and a failure here shouldn't block either of them — it just leaves
  // CourseClassStats showing its loading placeholder.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadCourseClassStats(token, params.id).then((result) => {
      if (!cancelled && result.ok) setClassStats(result.data);
    });

    return () => {
      cancelled = true;
    };
  }, [token, params.id]);

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
      // The instructor's scoped roster (GET /api/instructor/students, default scope) may no
      // longer include this student if this was their last course — same invalidation as
      // AddStudentModal's enroll path, in the other direction.
      clearCachedInstructorStudents();
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
                  <CopyCodeButton code={course.code} variant="icon" ariaLabel="Copy course code" />
                </div>
              </div>
              <div className="flex flex-none flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStudentsDrawerOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-purple px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-purple-dark"
                >
                  <UsersIcon />
                  Students ({course.students.length})
                </button>
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
                  onClick={() => setDuplicateModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-brand-purple/40 bg-white px-4 py-2 text-sm font-extrabold text-brand-purple transition hover:border-brand-purple"
                >
                  <DuplicateIcon />
                  Duplicate course
                </button>
                <button
                  type="button"
                  onClick={() => setEditModalOpen(true)}
                  aria-label="Edit course"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-brand-purple hover:text-brand-purple"
                >
                  <EditIcon />
                </button>
                {/*
                  Labelled, unlike the icon-only Edit button next to it: this is the one
                  irreversible action on the page, and an unlabelled trash can is exactly the
                  control someone clicks to find out what it does.
                */}
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-brand-danger/40 bg-white px-4 py-2 text-sm font-extrabold text-brand-danger transition hover:border-brand-danger"
                >
                  <TrashIcon />
                  Delete course
                </button>
              </div>
            </div>

            <div className="mb-6">
              <CourseClassStats stats={classStats} />
            </div>

            {error ? <p className="mb-4 text-sm font-semibold text-brand-danger">{error}</p> : null}

            {quizzesLoadFailed ? (
              <div className="rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-center">
                <p className="mb-3 text-sm font-semibold text-brand-danger">Failed to load this course&apos;s quizzes.</p>
                <button
                  type="button"
                  onClick={() => setQuizzesRetryCount((count) => count + 1)}
                  className="rounded-full bg-brand-purple px-4 py-1.5 text-xs font-extrabold text-white transition hover:bg-brand-purple-dark"
                >
                  Retry
                </button>
              </div>
            ) : quizzes === null ? (
              <p className="text-sm font-semibold text-gray-500">Loading…</p>
            ) : (
              <CourseQuizzesList quizzes={quizzes} courseId={params.id} />
            )}
          </>
        )}
      </div>

      {editModalOpen && course ? (
        <EditCourseModal
          course={course}
          token={token}
          onClose={() => setEditModalOpen(false)}
          onSaved={(updated) =>
            setCourse((current) =>
              current
                ? { ...current, name: updated.name, code: updated.code, semester: updated.semester, coverImageUrl: updated.coverImageUrl }
                : current,
            )
          }
        />
      ) : null}

      {deleteModalOpen && course ? (
        <DeleteCourseModal
          course={{ id: course.id, name: course.name, studentCount: course.students.length }}
          token={token}
          onClose={() => setDeleteModalOpen(false)}
          // Back to the list rather than staying on a page whose course no longer exists. The
          // list refetches on mount (its effect depends on token/retryCount), so the deleted
          // course is gone from it without any cache to invalidate.
          onDeleted={() => router.push('/instructor/courses')}
        />
      ) : null}

      {duplicateModalOpen && course ? (
        <DuplicateCourseModal
          course={course}
          token={token}
          onCreated={(newCourse) => setDuplicatedCourse(newCourse)}
          // onClose fires on every dismissal path (Done, Escape, backdrop, the X). Only navigate
          // away if a duplicate actually happened — a plain Cancel on the empty form must leave
          // the instructor exactly where they were. The list page (not this one) is what shows
          // "the copy appears in the list" per its own effect, which refetches on mount.
          onClose={() => {
            setDuplicateModalOpen(false);
            if (duplicatedCourse) router.push('/instructor/courses');
            setDuplicatedCourse(null);
          }}
        />
      ) : null}

      {studentsDrawerOpen && course ? (
        <CourseStudentsDrawer
          courseId={course.id}
          students={course.students}
          onClose={() => setStudentsDrawerOpen(false)}
          onRemove={handleRemove}
          onOpenAddStudent={() => setAddStudentModalOpen(true)}
        />
      ) : null}

      {/*
        Rendered after the drawer above on purpose: both are fixed-position, z-50 overlays, and at
        equal z-index a later sibling in the DOM paints on top. "Add student" inside the drawer
        opens this without closing the drawer first (see CourseStudentsDrawer's own docblock), so
        this ordering is what makes the modal visually stack above the drawer instead of under it.
      */}
      {addStudentModalOpen && course ? (
        <AddStudentModal
          token={token}
          instructorId={profile.user_id}
          courseId={course.id}
          enrolledIds={course.students.map((s) => s.id)}
          onClose={() => setAddStudentModalOpen(false)}
          onAdded={(student) => {
            setError('');
            setCourse((current) => (current ? { ...current, students: [...current.students, student] } : current));
          }}
        />
      ) : null}
    </AppShell>
  );
}
