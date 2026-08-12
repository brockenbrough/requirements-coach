'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { StudentCourseCard } from '../../components/StudentCourseCard';
import { loadJoinableCourses } from '../../lib/studentCourseClient';
import type { JoinableCourse } from '../../lib/courseTypes';
import { useRequireRole } from '../../lib/useRequireRole';

/**
 * GitHub #242 (UI-2): browse every available course and join one — the expanded version of
 * "Join Course" the issue asks for, a full page instead of a bare code-entry modal. Real now
 * (lib/studentCourseClient.ts, REQ-DL-5): GET /api/courses lists courses with a code
 * (course_code IS NOT NULL) but never the code itself — that's a secret the instructor hands
 * out directly, so joining (StudentCourseCard) is a manual code-entry step, not a click on
 * something already visible here. Each course's alreadyMember flag is already scoped to this
 * student server-side.
 */
export default function BrowseCoursesPage() {
  // Also redirects an instructor account away (GitHub #82) — joining a course as a student is
  // not something an instructor account does.
  const { token, profile, loading, authorized } = useRequireRole('student');

  const [courses, setCourses] = useState<JoinableCourse[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [nameQuery, setNameQuery] = useState('');
  const [professorQuery, setProfessorQuery] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoadFailed(false);

    loadJoinableCourses(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setCourses(result.data.courses);
      else setLoadFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [token, retryCount]);

  // Two independent, always-combinable filters (AND, not OR) — matches the Activity Log's
  // filter row (components/ActivityFilters.tsx): each field narrows the list on its own,
  // client-side, as soon as the course list is in hand. No code filter — the code is never in
  // this response (see the file header), so there's nothing here to search it by.
  const filtered = useMemo(() => {
    if (!courses) return [];
    const name = nameQuery.trim().toLowerCase();
    const professor = professorQuery.trim().toLowerCase();

    return courses.filter(
      (course) =>
        (!name || course.name.toLowerCase().includes(name)) &&
        (!professor || course.professorName.toLowerCase().includes(professor)),
    );
  }, [courses, nameQuery, professorQuery]);

  if (loading || !authorized) return null;
  if (!token || !profile) return null;

  function handleJoined(courseId: string) {
    setCourses((current) => current?.map((c) => (c.id === courseId ? { ...c, alreadyMember: true } : c)) ?? current);
  }

  return (
    <AppShell active="courses">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Courses</h1>
        <p className="mb-6 max-w-2xl text-sm font-semibold text-gray-500">
          Find your professor&apos;s course by name, then enter the code they gave you to join.
        </p>

        <div className="mb-5 flex flex-wrap gap-4">
          <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
            Course name
            <input
              type="text"
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder="Search by name…"
              className="mt-1 block w-56 rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
            />
          </label>
          <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
            Professor
            <input
              type="text"
              value={professorQuery}
              onChange={(event) => setProfessorQuery(event.target.value)}
              placeholder="Search by professor…"
              className="mt-1 block w-56 rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
            />
          </label>
        </div>

        {loadFailed ? (
          <div className="rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-6 text-center">
            <p className="mb-4 text-sm font-semibold text-brand-danger">Failed to load courses.</p>
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
        ) : filtered.length === 0 ? (
          <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
            No courses match your search.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((course) => (
              <StudentCourseCard key={course.id} course={course} token={token} onJoined={handleJoined} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
