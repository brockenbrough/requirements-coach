'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { LeaderboardCourseSwitcher } from '../../components/LeaderboardCourseSwitcher';
import { LeaderboardSkeleton } from '../../components/LeaderboardSkeleton';
import { LeaderboardTable, YourPositionStrip } from '../../components/LeaderboardTable';
import { Pagination } from '../../components/Pagination';
import { getMockCourses, getMockLeaderboard } from '../../lib/mockLeaderboard';
import type { LeaderboardEntry } from '../../lib/leaderboardTypes';
import { useRequireRole } from '../../lib/useRequireRole';

const PAGE_SIZE = 10; // keep in sync with ROW_COUNT in components/LeaderboardSkeleton.tsx

// Phase 1 only: lib/mockLeaderboard.ts answers instantly, so without a delay the skeleton would
// never render and nobody could tell whether the page jumps when data lands. Delete this along
// with the mock when the real fetch replaces it.
const MOCK_LOAD_DELAY_MS = 600;

/**
 * The course leaderboard: where a student stands against their classmates.
 *
 * Phase 1 — the data is hardcoded (lib/mockLeaderboard.ts) and rankChange is part of that mock.
 * The real version reads GET /api/courses/{courseId}/leaderboard and derives rankChange on the
 * client from lib/previousRankStore.ts; nothing else on this page should need to change.
 *
 * Split into an inner component because useSearchParams() forces the nearest Suspense boundary
 * to render client-side — without one, `npm run build` fails prerendering this route.
 */
function LeaderboardContent() {
  // Also redirects an instructor account away: a leaderboard ranks students against each other,
  // which is not a view an instructor account belongs in (same reasoning as /activities).
  const { profile, loading, authorized } = useRequireRole('student');

  const router = useRouter();
  const searchParams = useSearchParams();

  const courses = useMemo(() => getMockCourses(), []);
  const courseIdParam = searchParams.get('courseId');
  // An unknown ?courseId= falls back to the first course rather than showing an empty page for
  // a course the student isn't in — the switcher then re-syncs the URL below.
  const selectedCourseId =
    courses.find((course) => course.courseId === courseIdParam)?.courseId ?? courses[0]?.courseId ?? null;

  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [page, setPage] = useState(1);

  const studentId = profile?.user_id;

  useEffect(() => {
    if (!selectedCourseId) {
      setEntries([]);
      return;
    }

    let cancelled = false;
    setEntries(null);
    setPage(1);

    const timer = setTimeout(() => {
      if (!cancelled) setEntries(getMockLeaderboard(selectedCourseId, studentId));
    }, MOCK_LOAD_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedCourseId, studentId]);

  function handleSelectCourse(courseId: string) {
    router.replace(`/leaderboard?courseId=${encodeURIComponent(courseId)}`, { scroll: false });
  }

  const rows = entries ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const me = rows.find((entry) => entry.studentId === studentId) ?? null;
  const meOnPage = pageEntries.some((entry) => entry.studentId === studentId);

  // The redirect in useRequireRole runs in an effect, so rendering before it lands would flash
  // this page at an instructor.
  if (loading || !authorized) return null;

  return (
    <AppShell active="leaderboard">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1.5 text-2xl font-extrabold text-brand-navy">Leaderboard</h1>
        <p className="mb-6 text-sm font-semibold text-gray-500">
          Ranked by cumulative score — your best result at each difficulty level of every activity,
          added up.
        </p>

        {courses.length === 0 ? (
          <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center">
            <p className="text-sm font-bold text-brand-navy">You&apos;re not in a course yet.</p>
            <p className="mt-1.5 text-sm font-semibold text-gray-500">
              A leaderboard ranks you against your classmates, so it needs a course first.
            </p>
            <Link
              href="/courses"
              className="mt-4 inline-flex rounded-brand-md bg-brand-purple px-4 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Browse courses
            </Link>
          </div>
        ) : (
          <>
            <LeaderboardCourseSwitcher
              courses={courses}
              selectedCourseId={selectedCourseId}
              onSelect={handleSelectCourse}
            />

            {entries === null ? (
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
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardContent />
    </Suspense>
  );
}
