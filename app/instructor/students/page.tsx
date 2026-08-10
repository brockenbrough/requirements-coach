'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { InstructorStudentCard } from '../../../components/InstructorStudentCard';
import { Pagination } from '../../../components/Pagination';
import {
  summarizeStudents,
  toStudentActivitySummary,
  type StudentActivitySummary,
  type StudentAggregate,
} from '../../../lib/activityLogTypes';
import { loadInstructorActivities, loadInstructorStudents, type InstructorActivityEntry } from '../../../lib/sessionClient';
import { useRequireRole } from '../../../lib/useRequireRole';

const PAGE_SIZE = 9;

type SortOrder = 'needs-attention' | 'score-asc' | 'score-desc' | 'attempts-desc' | 'name';

/** null (no completed attempts yet) always sorts after every known average, in either direction. */
function compareByScore(a: StudentAggregate, b: StudentAggregate, direction: 1 | -1) {
  if (a.averageScore === null) return b.averageScore === null ? 0 : 1;
  if (b.averageScore === null) return -1;
  return (a.averageScore - b.averageScore) * direction;
}

/**
 * The full class roster (GitHub #82) — where the Instructor Dashboard's "View more students"
 * inline expansion doesn't scale (a real class, or several sections, can run well past what's
 * comfortable in a growing single-page grid). Same InstructorStudentCard as the dashboard, same
 * summarizeStudents aggregation, but paginated and with its own search/sort so an instructor can
 * find one specific student directly instead of scrolling.
 *
 * Only students who have attempted something appear — the roster is derived from attempts
 * (GitHub #171), so an enrolled student who never started an activity has no row to aggregate.
 */
export default function AllStudentsPage() {
  const { token, profile, loading, authorized } = useRequireRole('instructor');

  const [entries, setEntries] = useState<StudentActivitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOrder>('needs-attention');
  const [page, setPage] = useState(1);

  // Same class-wide fetch as the dashboard, made independently rather than shared: this list is
  // uncached (see loadInstructorActivities), and the two pages are separate entry points.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadInstructorActivities(token).then((result) => {
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
  }, [token]);

  useEffect(() => {
    if (!token || !profile?.user_id) return;
    let cancelled = false;
    loadInstructorStudents(token, profile.user_id).then((result) => {
      if (cancelled || !result.ok) return;
      // Warms the cache so repeat visits don't re-fetch the full roster.
    });
    return () => { cancelled = true; };
  }, [token, profile?.user_id]);

  const allStudents = useMemo(() => summarizeStudents(entries ?? []), [entries]);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? allStudents.filter((student) => student.studentName.toLowerCase().includes(q)) : allStudents;
    const sorted = [...rows];

    switch (sort) {
      case 'score-asc':
        sorted.sort((a, b) => compareByScore(a, b, 1));
        break;
      case 'score-desc':
        sorted.sort((a, b) => compareByScore(a, b, -1));
        break;
      case 'attempts-desc':
        sorted.sort((a, b) => b.attempts - a.attempts);
        break;
      case 'name':
        sorted.sort((a, b) => a.studentName.localeCompare(b.studentName));
        break;
      default:
        // summarizeStudents already returns this order (needs-attention first, then
        // alphabetical); re-sorting here just keeps it stable after a search/sort round trip.
        sorted.sort((a, b) => {
          if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
          return a.studentName.localeCompare(b.studentName);
        });
    }

    return sorted;
  }, [allStudents, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStudents = filteredSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  function handleSortChange(value: SortOrder) {
    setSort(value);
    setPage(1);
  }

  if (loading || !authorized) return null;

  return (
    <AppShell active="instructor">
      <div className="mx-auto max-w-5xl">
        <Link href="/instructor" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy">
          ← Back to Dashboard
        </Link>

        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">All Students</h1>
        <p className="mb-6 max-w-2xl text-sm font-semibold text-gray-500">
          Every student in the class. Search by name, sort, or click through to a student&apos;s detail page.
        </p>

        {error ? (
          <p className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            {error}
          </p>
        ) : entries === null ? (
          <p className="mb-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
                Search
                <input
                  type="text"
                  value={query}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  placeholder="Search by name…"
                  className="mt-1 block w-56 rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
                />
              </label>

              <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
                Sort
                <select
                  value={sort}
                  onChange={(event) => handleSortChange(event.target.value as SortOrder)}
                  className="mt-1 block rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-bold text-gray-600 outline-none transition focus:border-brand-purple"
                >
                  <option value="needs-attention">Needs attention first</option>
                  <option value="score-asc">Average score: Low to high</option>
                  <option value="score-desc">Average score: High to low</option>
                  <option value="attempts-desc">Most attempts</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </label>
            </div>

            {pageStudents.length === 0 ? (
              <p className="rounded-brand-lg border border-gray-100 bg-gray-50 p-6 text-center text-sm font-semibold text-gray-500">
                {/* An empty class and a search that matched nothing are different states now that
                    the roster is real — only students with at least one attempt appear here. */}
                {query ? `No students match "${query}".` : 'No student has attempted an activity yet.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pageStudents.map((student) => (
                  <InstructorStudentCard key={student.studentId} student={student} />
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-gray-500">
                {filteredSorted.length === 0
                  ? '0 students'
                  : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredSorted.length)} of ${filteredSorted.length} students`}
              </span>

              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
