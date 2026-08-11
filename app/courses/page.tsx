'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { StudentCourseCard } from '../../components/StudentCourseCard';
import { loadCourses, type Course } from '../../lib/mockCourses';
import { useRequireRole } from '../../lib/useRequireRole';

/**
 * GitHub #242 (UI-2): browse every available course and join one — the expanded version of
 * "Join Course" the issue asks for, a full page instead of a bare code-entry modal. Backend
 * (API-2) doesn't exist yet, so this runs on lib/mockCourses.ts; see that file's header for
 * what a real integration needs to swap in (notably: a student-facing GET /api/courses, not
 * reusing the instructor-scoped one this mock's loadCourses stands in for either way).
 */
export default function BrowseCoursesPage() {
  // Also redirects an instructor account away (GitHub #82) — joining a course as a student is
  // not something an instructor account does.
  const { token, profile, loading, authorized } = useRequireRole('student');

  const [courses, setCourses] = useState<Course[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [codeQuery, setCodeQuery] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [professorQuery, setProfessorQuery] = useState('');

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

  // Three independent, always-combinable filters (AND, not OR) — matches the Activity Log's
  // filter row (components/ActivityFilters.tsx): each field narrows the list on its own,
  // client-side, as soon as the mock course list is in hand.
  const filtered = useMemo(() => {
    if (!courses) return [];
    const code = codeQuery.trim().toLowerCase();
    const name = nameQuery.trim().toLowerCase();
    const professor = professorQuery.trim().toLowerCase();

    return courses.filter(
      (course) =>
        (!code || course.code.toLowerCase().includes(code)) &&
        (!name || course.name.toLowerCase().includes(name)) &&
        (!professor || course.professorName.toLowerCase().includes(professor)),
    );
  }, [courses, codeQuery, nameQuery, professorQuery]);

  if (loading || !authorized) return null;
  if (!token || !profile) return null;

  function handleJoined(updated: Course) {
    setCourses((current) => current?.map((c) => (c.id === updated.id ? updated : c)) ?? current);
  }

  return (
    <AppShell active="courses">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Courses</h1>
        <p className="mb-6 max-w-2xl text-sm font-semibold text-gray-500">
          Find your professor&apos;s course by code, name, or their name, and join with one click.
        </p>

        <div className="mb-5 flex flex-wrap gap-4">
          <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
            Course code
            <input
              type="text"
              value={codeQuery}
              onChange={(event) => setCodeQuery(event.target.value)}
              placeholder="e.g. FALL26"
              className="mt-1 block w-40 rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
            />
          </label>
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
              <StudentCourseCard key={course.id} course={course} token={token} studentId={profile.user_id} onJoined={handleJoined} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
