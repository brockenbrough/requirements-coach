'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../../components/AppShell';
import { CourseStudentList } from '../../../../../components/CourseStudentList';
import { Pagination } from '../../../../../components/Pagination';
import { StudentFilterControls } from '../../../../../components/StudentFilterControls';
import { filterAndSortCourseStudents, type CourseStudentFilter } from '../../../../../lib/courseStudentFilters';
import { loadCourse, removeStudentFromCourse, type CourseDetail, type CourseStudent } from '../../../../../lib/courseClient';
import { useRequireRole } from '../../../../../lib/useRequireRole';

const PAGE_SIZE = 12;

/**
 * Every student enrolled in one course (GitHub #378 "UI: Change Course View") — the
 * CourseStudentsDrawer's "View all students" escape hatch for a roster too large to browse
 * comfortably in a ~380px panel. Same data source as the course detail page
 * (GET /api/instructor/courses/{id} via loadCourse) and the exact same search/filter/row pieces
 * the drawer uses (StudentFilterControls, filterAndSortCourseStudents, CourseStudentList) so the
 * two views can never disagree about what a filter means — this page only adds pagination
 * (components/Pagination.tsx, GitHub #82) on top, for when the filtered result is still long.
 */
export default function CourseStudentsPage({ params }: { params: { id: string } }) {
  // Same guard as every other /instructor/* page (GitHub #82/#169).
  const { token, loading, authorized } = useRequireRole('instructor');

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CourseStudentFilter>('all');
  const [page, setPage] = useState(1);

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
  if (!token) return null;

  async function handleRemove(student: CourseStudent) {
    if (!course) return;
    if (!confirm(`Remove ${student.name} from this course?`)) return;

    setError('');
    const result = await removeStudentFromCourse(token!, course.id, student.id);
    if (result.ok) {
      setCourse((current) => (current ? { ...current, students: current.students.filter((s) => s.id !== student.id) } : current));
    } else {
      setError(result.error);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function handleFilterChange(value: CourseStudentFilter) {
    setFilter(value);
    setPage(1);
  }

  const filtered = course ? filterAndSortCourseStudents(course.students, { query, filter }) : [];
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStudents = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <AppShell active="instructor-courses">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/instructor/courses/${encodeURIComponent(params.id)}`}
          className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy"
        >
          ← Back to course
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
            <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">{course.name} — Students</h1>
            <p className="mb-6 text-sm font-semibold text-gray-500">
              {course.students.length} student{course.students.length === 1 ? '' : 's'} enrolled.
            </p>

            {error ? <p className="mb-4 text-sm font-semibold text-brand-danger">{error}</p> : null}

            <div className="mb-5">
              <StudentFilterControls query={query} onQueryChange={handleQueryChange} filter={filter} onFilterChange={handleFilterChange} />
            </div>

            <CourseStudentList
              students={pageStudents}
              onRemove={handleRemove}
              emptyMessage={query || filter !== 'all' ? 'No students match.' : 'No students enrolled yet.'}
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500">
                {filtered.length === 0
                  ? '0 students'
                  : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length} students`}
              </span>

              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
