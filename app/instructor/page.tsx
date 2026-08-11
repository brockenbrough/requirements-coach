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
import { InstructorDashboardSkeleton } from '../../components/InstructorDashboardSkeleton';
import { InstructorRoster } from '../../components/InstructorRoster';
import { Pagination } from '../../components/Pagination';
import { summarizeStudents, toStudentActivitySummary, type StudentActivitySummary } from '../../lib/activityLogTypes';
import { loadInstructorActivities, loadInstructorStudents, type InstructorActivityEntry, type StudentSummary } from '../../lib/sessionClient';
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
  const { token, profile, loading, authorized } = useRequireRole('instructor');
  const searchParams = useSearchParams();

  const [entries, setEntries] = useState<StudentActivitySummary[] | null>(null);
  const [allStudents, setAllStudents] = useState<StudentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [studentId, setStudentId] = useState<StudentFilterValue>('all');
  const [level, setLevel] = useState<LevelFilterValue>('all');
  const [sort, setSort] = useState<InstructorSortOrder>('newest');
  const [page, setPage] = useState(1);

  // GET /api/instructor/activities (GitHub #171/#176) — cache-first; forceRefresh on the
  // Refresh button or when profile.user_id becomes available for the first time.
  useEffect(() => {
    if (!token || !profile?.user_id) return;
    let cancelled = false;

    loadInstructorActivities(token, profile.user_id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setEntries(result.data.sessions.map((session: InstructorActivityEntry) => toStudentActivitySummary(session)));
      } else {
        setError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile?.user_id]);

  function handleRefresh() {
    if (!token || !profile?.user_id || refreshing) return;
    setRefreshing(true);
    loadInstructorActivities(token, profile.user_id, { forceRefresh: true }).then((result) => {
      setRefreshing(false);
      if (result.ok) {
        setEntries(result.data.sessions.map((session: InstructorActivityEntry) => toStudentActivitySummary(session)));
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  useEffect(() => {
    if (!token || !profile?.user_id) return;
    let cancelled = false;
    loadInstructorStudents(token, profile.user_id).then((result) => {
      if (cancelled) return;
      if (result.ok) setAllStudents(result.data.students);
    });
    return () => { cancelled = true; };
  }, [token, profile?.user_id]);

  const roster = useMemo(() => summarizeStudents(entries ?? []), [entries]);

  // Used by ActivityLogTable to resolve a student name for each attempt row.
  const studentNameById = useMemo(
    () => new Map((entries ?? []).map((entry) => [entry.studentId, entry.studentName])),
    [entries],
  );

  const students = useMemo(
    () =>
      (allStudents ?? [])
        .map((s) => ({ id: s.userId, name: `${s.firstName} ${s.lastName}`.trim() || s.username }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allStudents],
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
        <div className="mb-1.5 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-extrabold text-brand-navy">Instructor Dashboard</h1>
          <button
            onClick={handleRefresh}
            disabled={refreshing || entries === null}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-brand-purple hover:text-brand-purple disabled:opacity-40"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className="mb-6 max-w-2xl text-sm font-semibold text-gray-500">
          Every student&apos;s activity, across every activity type — filter by student or level, or sort to surface who needs a
          hand.
        </p>

        {error ? (
          <p className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            {error}
          </p>
        ) : entries === null ? (
          <InstructorDashboardSkeleton />
        ) : entries.length === 0 ? (
          // GET /api/instructor/activities answers 200 [] for a class that has not started
          // anything (by design — see its docstring). Rendering the full dashboard here would
          // show empty stat tiles and the table's "No attempts match these filters." message,
          // which blames filters the instructor never set (GitHub #174).
          <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-10 text-center">
            <p className="text-sm font-extrabold text-brand-navy">No activity yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm font-semibold text-gray-500">
              Once students start an activity, their attempts show up here.
            </p>
          </div>
        ) : (
          <>
            <InstructorActivityStats entries={entries} />

            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wide text-gray-400">Students</h2>
              <Link href="/instructor/students" className="text-xs font-bold text-brand-purple hover:underline">
                View all students →
              </Link>
            </div>
            <InstructorRoster students={roster} selectedStudentId={studentId} />

            <InstructorFilters
              students={students}
              studentId={studentId}
              level={level}
              sort={sort}
              onStudentChange={handleStudentChange}
              onLevelChange={handleLevelChange}
              onSortChange={setSort}
            />

            <ActivityLogTable entries={pageEntries} getStudentName={(entry) => studentNameById.get(entry.studentId) ?? ''} />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500">
                {filteredSorted.length === 0
                  ? '0 attempts'
                  : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredSorted.length)} of ${filteredSorted.length} attempts`}
              </span>

              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
