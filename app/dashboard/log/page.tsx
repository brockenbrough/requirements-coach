'use client';

import Link from 'next/link';
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
import { deriveActivityFilterOptions, resultStateOf, toActivityLogEntry, type ActivityLogEntry } from '../../../lib/activityLogTypes';
import type { AvailableActivityTitles } from '../../../lib/leaderboardTypes';
import { loadActivityLog, loadAvailableTitles, type SessionListEntry } from '../../../lib/sessionClient';
import { useRequireRole } from '../../../lib/useRequireRole';

const PAGE_SIZE = 8;

export default function ActivityLogPage() {
  // Also redirects an instructor account away (GitHub #82) — the activity log is the
  // student's own quiz history, not something an instructor account has.
  const { token, profile, loading, authorized } = useRequireRole('student');

  // Raw sessions, kept separate from the display-ready `entries` derived below — activityName
  // resolution depends on `nameByType`, which loads independently (see the effect below), so
  // deriving entries as a useMemo lets a slow/late-arriving name lookup upgrade already-rendered
  // rows instead of only being applied at the one moment loadActivityLog happened to resolve.
  const [sessions, setSessions] = useState<SessionListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableTitles, setAvailableTitles] = useState<AvailableActivityTitles[]>([]);

  const [activity, setActivity] = useState<ActivityFilterValue>('all');
  const [status, setStatus] = useState<StatusFilterValue>('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [page, setPage] = useState(1);

  // GET /api/students/{id}/activities (GitHub #48), cached in localStorage
  // (lib/activityLogStore.ts) and refreshed wherever a session's progress changes.
  useEffect(() => {
    if (!token || !profile?.user_id) return;
    let cancelled = false;

    loadActivityLog(token, profile.user_id).then((result) => {
      if (cancelled) return;
      if (result.ok) setSessions(result.data.activities);
      else setError(result.error);
    });

    // Not blocking, and no dedicated error state: this only ever upgrades a custom quiz's entry
    // and filter labels from the raw activity_type key to a real display name (see
    // toActivityLogEntry/deriveActivityFilterOptions below) — a failure just leaves labels at
    // their raw-key fallback rather than breaking the log.
    loadAvailableTitles(token, profile.user_id).then((result) => {
      if (cancelled) return;
      if (result.ok) setAvailableTitles(result.data.activities);
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile?.user_id]);

  const nameByType = useMemo(
    () => new Map(availableTitles.map((entry) => [entry.activityType, entry.activityName])),
    [availableTitles],
  );

  // GitHub #476: entries — what the table actually renders — now go through the same
  // nameByType lookup the filter dropdown already used, so a custom catalog's real name shows up
  // consistently instead of only in the filter options.
  const entries = useMemo(
    () => (sessions === null ? null : sessions.map((session) => toActivityLogEntry(session, nameByType))),
    [sessions, nameByType],
  );

  const activityOptions = useMemo(
    () => deriveActivityFilterOptions(entries ?? [], nameByType),
    [entries, nameByType],
  );

  // Filtering/sorting stays client-side over the full fetched list — the same shape GitHub #48
  // was originally built against, just sourced from the API now.
  const filteredSorted = useMemo(() => {
    const rows = (entries ?? []).filter((entry) => {
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
  }, [entries, activity, status, sort]);

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

  if (loading || !authorized) return null;

  return (
    <AppShell active="dashboard">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy">
          ← Back to Dashboard
        </Link>

        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Activity Log</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">Every attempt, across every activity.</p>

        {error ? (
          <p className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            {error}
          </p>
        ) : entries === null ? (
          <p className="mb-6 text-sm font-semibold text-gray-500">Loading…</p>
        ) : (
          <>
            <ActivityStatsCards entries={entries} />

            <ActivityFilters
              activity={activity}
              activityOptions={activityOptions}
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
          </>
        )}
      </div>
    </AppShell>
  );
}
