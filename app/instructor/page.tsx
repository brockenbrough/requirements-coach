'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { ActivityLogTable } from '../../components/ActivityLogTable';
import { InstructorActivityStats } from '../../components/InstructorActivityStats';
import {
  InstructorFilters,
  type InstructorSortOrder,
  type LevelFilterValue,
  type StudentFilterValue,
} from '../../components/InstructorFilters';
import { InstructorRoster } from '../../components/InstructorRoster';
import { summarizeStudents, toStudentActivitySummary, type StudentActivitySummary } from '../../lib/activityLogTypes';
import { loadInstructorActivities, type InstructorActivityEntry } from '../../lib/sessionClient';
import { useRequireRole } from '../../lib/useRequireRole';

const PAGE_SIZE = 10;

// useSearchParams() (for the ?student= deep link from app/instructor/students/page.tsx) opts
// this page out of static rendering unless it's wrapped in Suspense.
export default function InstructorDashboardPage() {
  return (
    <Suspense fallback={null}>
      <InstructorDashboardContent />
    </Suspense>
  );
}

function InstructorDashboardContent() {
  // GitHub #82: redirects anyone who isn't a confirmed instructor — see lib/useRequireRole.ts
  // for exactly what "confirmed" means for a profile-less or student account.
  const { token, loading, authorized } = useRequireRole('instructor');
  const searchParams = useSearchParams();

  const [entries, setEntries] = useState<StudentActivitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [studentId, setStudentId] = useState<StudentFilterValue>('all');
  const [level, setLevel] = useState<LevelFilterValue>('all');
  const [sort, setSort] = useState<InstructorSortOrder>('newest');
  const [page, setPage] = useState(1);

  // GET /api/instructor/activities (GitHub #171) — the whole class, guarded server-side by
  // requireInstructor. Uncached on purpose: any student's answer changes this list, and this
  // tab never hears about it (see loadInstructorActivities).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadInstructorActivities(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setEntries(result.data.sessions.map((session: InstructorActivityEntry) => toStudentActivitySummary(session)));
      } else {
        // result.error already distinguishes "server said no" from "never reached the server"
        // (status 0) — see the request helper in lib/sessionClient.ts.
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const roster = useMemo(() => summarizeStudents(entries ?? []), [entries]);

  const students = useMemo(() => {
    const byId = new Map((entries ?? []).map((entry) => [entry.studentId, entry.studentName]));
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries]);

  const studentNameById = useMemo(
    () => new Map((entries ?? []).map((entry) => [entry.id, entry.studentName])),
    [entries],
  );

  // Lets app/instructor/students/page.tsx link straight into a filtered table
  // (/instructor?student=<id>) instead of needing its own detail view.
  useEffect(() => {
    const studentParam = searchParams.get('student');
    if (studentParam) setStudentId(studentParam);
  }, [searchParams]);

  const filteredSorted = useMemo(() => {
    const rows = (entries ?? []).filter((entry) => {
      if (studentId !== 'all' && entry.studentId !== studentId) return false;
      if (level !== 'all' && entry.level !== level) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (sort === 'oldest') return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
      if (sort === 'lowest') return a.score - b.score;
      if (sort === 'highest') return b.score - a.score;
      return new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
    });
  }, [entries, studentId, level, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = filteredSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleStudentChange(value: StudentFilterValue) {
    setStudentId(value);
    setPage(1);
  }

  function handleLevelChange(value: LevelFilterValue) {
    setLevel(value);
    setPage(1);
  }

  if (loading || !authorized) return null;

  return (
    <AppShell active="instructor">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Instructor Dashboard</h1>
        <p className="mb-6 max-w-2xl text-sm font-semibold text-gray-500">
          Every student&apos;s activity, across every activity type — filter by student or level, or sort to surface who needs a
          hand.
        </p>

        {error ? (
          <p className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            {error}
          </p>
        ) : entries === null ? (
          <p className="mb-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <InstructorActivityStats entries={entries} />

            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wide text-gray-400">Students</h2>
              <Link href="/instructor/students" className="text-xs font-bold text-brand-purple hover:underline">
                View all students →
              </Link>
            </div>
            <InstructorRoster students={roster} selectedStudentId={studentId} onSelectStudent={handleStudentChange} />

            <InstructorFilters
              students={students}
              studentId={studentId}
              level={level}
              sort={sort}
              onStudentChange={handleStudentChange}
              onLevelChange={handleLevelChange}
              onSortChange={setSort}
            />

            <ActivityLogTable entries={pageEntries} getStudentName={(entry) => studentNameById.get(entry.id) ?? ''} />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500">
                {filteredSorted.length === 0
                  ? '0 attempts'
                  : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredSorted.length)} of ${filteredSorted.length} attempts`}
              </span>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="min-w-9 rounded-brand-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`min-w-9 rounded-brand-md border px-2.5 py-1.5 text-xs font-bold transition ${
                      p === currentPage
                        ? 'border-brand-purple bg-brand-purple text-white'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="min-w-9 rounded-brand-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
