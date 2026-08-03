'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import {
  ActivityFilters,
  type ActivityFilterValue,
  type SortOrder,
  type StatusFilterValue,
} from '../../../components/ActivityFilters';
import { ActivityLogTable } from '../../../components/ActivityLogTable';
import { ActivityStatsCards } from '../../../components/ActivityStatsCards';
import { resultStateOf } from '../../../lib/activityLogTypes';
import { MOCK_ACTIVITY_LOGS } from '../../../lib/mockActivityLogs';
import { useAccessToken } from '../../../lib/useAccessToken';

const PAGE_SIZE = 8;

export default function ActivityLogPage() {
  const router = useRouter();
  const { token, loading } = useAccessToken();

  const [activity, setActivity] = useState<ActivityFilterValue>('all');
  const [status, setStatus] = useState<StatusFilterValue>('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [page, setPage] = useState(1);

  // No session, and we're done checking: send the user to a real "logged out"
  // screen instead of leaving this page mounted with nothing to show.
  useEffect(() => {
    if (!loading && !token) router.replace('/login');
  }, [loading, token, router]);

  // GitHub #48: UI only, against MOCK_ACTIVITY_LOGS. Filtering/sorting is genuinely client-side
  // here (not a preview of a server query) — that's what makes the filters testable without a
  // backend yet, and it's the seam that stops mattering once MOCK_ACTIVITY_LOGS becomes a fetch.
  const filteredSorted = useMemo(() => {
    const rows = MOCK_ACTIVITY_LOGS.filter((entry) => {
      if (activity !== 'all' && entry.activityType !== activity) return false;
      if (status !== 'all' && resultStateOf(entry) !== status) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (sort === 'oldest') return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
      if (sort === 'highest') return b.score - a.score;
      if (sort === 'lowest') return a.score - b.score;
      return new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
    });
  }, [activity, status, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = filteredSorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleActivityChange(value: ActivityFilterValue) {
    setActivity(value);
    setPage(1);
  }

  function handleStatusChange(value: StatusFilterValue) {
    setStatus(value);
    setPage(1);
  }

  if (loading) return null;

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0e0b1e] px-6 text-center text-[#F3F1FF]">
        <div>
          <p className="mb-4">You must be logged in to view your activity log.</p>
          <Link href="/login" className="rounded-full bg-[#7C4DFF] px-4 py-2 text-sm font-bold text-white">
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy">
          ← Back to Dashboard
        </Link>

        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Activity Log</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">Every attempt, across every activity.</p>

        <ActivityStatsCards entries={MOCK_ACTIVITY_LOGS} />

        <ActivityFilters
          activity={activity}
          status={status}
          sort={sort}
          onActivityChange={handleActivityChange}
          onStatusChange={handleStatusChange}
          onSortChange={setSort}
        />

        <ActivityLogTable entries={pageEntries} />

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
      </div>
    </AppShell>
  );
}
