'use client';

import { useEffect, useState } from 'react';
import { LeaderboardTable } from './LeaderboardTable';
import { LeaderboardSkeleton } from './LeaderboardSkeleton';
import { loadCourseLeaderboard } from '../lib/studentCourseClient';
import type { LeaderboardEntry } from '../lib/leaderboardTypes';

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
 * drifting between the two leaderboard surfaces. No pagination and no top-N cut — a single
 * course's roster is the right size for one table, and LeaderboardTable's own empty state ("No one
 * in this course has completed an activity yet") already fits this exact context.
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

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setFailed(false);

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
        <LeaderboardTable entries={entries} currentStudentId={studentId} />
      )}
    </section>
  );
}
