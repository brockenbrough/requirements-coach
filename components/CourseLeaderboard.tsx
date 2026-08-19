'use client';

import { useEffect, useState } from 'react';
import { LeaderboardTable, YourPositionStrip } from './LeaderboardTable';
import { LeaderboardSkeleton } from './LeaderboardSkeleton';
import { Pagination } from './Pagination';
import { loadCourseLeaderboard } from '../lib/studentCourseClient';
import type { LeaderboardEntry } from '../lib/leaderboardTypes';

// Smaller than app/leaderboard/page.tsx's PAGE_SIZE (10) — this table is one embedded section on
// the course page, not the whole page, so a shorter window keeps it from dominating the layout.
const PAGE_SIZE = 5;

/**
 * GitHub #432 follow-up: this course's own leaderboard, embedded directly in the course's quiz
 * list (app/courses/[id]/page.tsx). Not a new data source — GET /api/courses/{courseId}/leaderboard
 * (lib/leaderboardQueries.ts's computeCourseLeaderboard) already ranks students by points earned
 * specifically in this course, and both the dashboard's LeaderboardPreview and app/leaderboard/page.tsx
 * already read it through the same courseId-keyed cache (lib/leaderboardStore.ts) via
 * lib/studentCourseClient.ts's loadCourseLeaderboard. This is a third reader of that identical
 * cache/route, so a completed session updates this view the same way it already updates the other
 * two: the play flow's handleFinishSummary blanket-clears the leaderboard cache on score change,
 * and the next mount here (returning to this page) simply re-fetches through the now-empty cache —
 * no new invalidation path needed.
 *
 * Reuses LeaderboardTable as-is rather than the dashboard's smaller LeaderboardPreview rows: this
 * page has full single-column width to render a table in (unlike the dashboard's ~600px column),
 * and reusing it verbatim is what keeps rank badges, avatars and points formatting from ever
 * drifting between the two leaderboard surfaces.
 *
 * Paged the same way app/leaderboard/page.tsx is (shared Pagination + YourPositionStrip when the
 * viewer's own row falls off the current page) — a full, unpaginated roster scrolled forever once
 * a course had more than a handful of students, which is exactly the load-test scale GitHub #275
 * exists to catch. Paging stays client-side: computeCourseLeaderboard already returns the whole
 * ranked roster in one call, same as the global leaderboard.
 */
export function CourseLeaderboard({
  token,
  courseId,
  studentId,
}: {
  token: string;
  courseId: string;
  studentId?: string;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setFailed(false);
    setPage(1);

    loadCourseLeaderboard(token, courseId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setEntries(result.data.entries);
    });

    return () => {
      cancelled = true;
    };
  }, [token, courseId]);

  const rows = entries ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const me = rows.find((entry) => entry.studentId === studentId) ?? null;
  const meOnPage = pageEntries.some((entry) => entry.studentId === studentId);

  return (
    <section className="mt-8">
      <h3 className="mb-5 text-lg font-extrabold text-brand-navy">Course Leaderboard</h3>

      {failed ? (
        <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center">
          <p className="text-sm font-bold text-brand-navy">Could not load this course&apos;s leaderboard.</p>
        </div>
      ) : entries === null ? (
        <LeaderboardSkeleton />
      ) : (
        <>
          <LeaderboardTable entries={pageEntries} currentStudentId={studentId} />

          {me && !meOnPage ? <YourPositionStrip entry={me} /> : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-gray-500">
              {rows.length === 0
                ? '0 students'
                : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, rows.length)} of ${rows.length} students`}
            </span>

            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}
    </section>
  );
}
