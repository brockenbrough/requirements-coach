"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import {
  ALL_COURSES_SCOPE,
  LeaderboardCourseSwitcher,
} from "../../components/LeaderboardCourseSwitcher";
import { LeaderboardSkeleton } from "../../components/LeaderboardSkeleton";
import {
  LeaderboardTable,
  YourPositionStrip,
} from "../../components/LeaderboardTable";
import { Pagination } from "../../components/Pagination";
import {
  GLOBAL_LEADERBOARD_KEY,
  loadCourseLeaderboard,
  loadGlobalLeaderboard,
  loadMyLeaderboardCourses,
} from "../../lib/studentCourseClient";
import { getCachedLeaderboard } from "../../lib/leaderboardStore";
import { recordLeaderboardRanks } from "../../lib/previousRankStore";
import type {
  LeaderboardCourse,
  LeaderboardEntry,
} from "../../lib/leaderboardTypes";
import { useRequireRole } from "../../lib/useRequireRole";

const PAGE_SIZE = 10; // keep in sync with ROW_COUNT in components/LeaderboardSkeleton.tsx

/**
 * The full leaderboard: where a student stands, either against every student in the app ("All",
 * the default) or against one course's roster at a time.
 *
 * "All" reads GET /api/leaderboard via loadGlobalLeaderboard; a specific course reads
 * GET /api/courses/{courseId}/leaderboard via loadCourseLeaderboard — genuinely different
 * endpoints/queries (computeGlobalLeaderboard vs. computeCourseLeaderboard, lib/leaderboardQueries.ts),
 * not the same one with/without a filter tacked on. Both share the same courseId-keyed cache
 * (lib/leaderboardStore.ts) and rank-snapshot store (lib/previousRankStore.ts) as the dashboard's
 * always-global LeaderboardPreview, under the reserved GLOBAL_LEADERBOARD_KEY when the scope is
 * "All" — the two views can't disagree about the global ranking's cache or "since last visit" delta.
 *
 * rankChange is attached by the client call from lib/previousRankStore.ts's last-recorded
 * snapshot; this page is what records the NEW snapshot, once per fresh fetch, after the entries
 * carrying the old snapshot's deltas have rendered — see the effect below and
 * recordLeaderboardRanks's own doc.
 *
 * Split into an inner component because useSearchParams() forces the nearest Suspense boundary
 * to render client-side — without one, `npm run build` fails prerendering this route.
 */
function LeaderboardContent() {
  // Also redirects an instructor account away: a leaderboard ranks students against each other,
  // which is not a view an instructor account belongs in (same reasoning as /activities).
  const { token, profile, loading, authorized } = useRequireRole("student");

  const router = useRouter();
  const searchParams = useSearchParams();

  const [courses, setCourses] = useState<LeaderboardCourse[] | null>(null);
  const [coursesFailed, setCoursesFailed] = useState(false);

  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [entriesFailed, setEntriesFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);

  const studentId = profile?.user_id;

  // The course list a student can see a leaderboard for is exactly "my courses" — cached
  // session-scoped via loadMyLeaderboardCourses (GitHub #328) so revisiting this page within the
  // same app session doesn't re-fetch it, the same way loadCourseLeaderboard already caches the
  // entries themselves.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadMyLeaderboardCourses(token).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setCoursesFailed(true);
        return;
      }
      setCourses(result.data.courses);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const courseIdParam = searchParams.get("courseId");
  // Anything that isn't one of the student's own courses — no param, "all" itself, or an unknown
  // id — resolves to "All" (the default cross-course view) rather than an empty page for a course
  // the student isn't in. The switcher then re-syncs the URL below.
  const selectedScope: string = courses
    ? (courses.find((course) => course.courseId === courseIdParam)?.courseId ?? ALL_COURSES_SCOPE)
    : ALL_COURSES_SCOPE;

  // The cache/rank-snapshot key for the current scope — the reserved GLOBAL_LEADERBOARD_KEY for
  // "All", sharing the same entry the dashboard's LeaderboardPreview reads/writes, or the real
  // course_id otherwise.
  const scopeCacheKey = selectedScope === ALL_COURSES_SCOPE ? GLOBAL_LEADERBOARD_KEY : selectedScope;

  useEffect(() => {
    if (!token || !courses) {
      setEntries(null);
      return;
    }
    if (courses.length === 0) {
      setEntries([]);
      return;
    }

    let cancelled = false;
    // Skip the null reset (and the resulting skeleton) when this scope's leaderboard is already
    // cached this session — the loader below will resolve it from cache essentially instantly, so
    // there is nothing to show a loading state for (GitHub #328).
    if (getCachedLeaderboard(scopeCacheKey) === null) {
      setEntries(null);
    }
    setEntriesFailed(false);
    setPage(1);

    const loader =
      selectedScope === ALL_COURSES_SCOPE ? loadGlobalLeaderboard(token) : loadCourseLeaderboard(token, selectedScope);

    loader.then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setEntriesFailed(true);
        return;
      }
      setEntries(result.data.entries);
    });

    return () => {
      cancelled = true;
    };
    // courses !== null (not `courses` itself) is the third dep deliberately: selectedScope
    // resolves to ALL_COURSES_SCOPE both before courses has loaded and after (whenever no
    // ?courseId= is in the URL), so without some signal that loading finished, this effect would
    // never re-fire the moment courses arrives and entries would stay stuck on the skeleton
    // forever. The boolean (not the array reference) is what keeps this from refiring every time
    // handleRefresh gives `courses` a new array identity without selectedScope changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedScope, courses !== null]);

  // Records THIS render's ranks as the new "previous" snapshot, once per fresh, non-empty fetch —
  // never during the fetch that produced the rankChange values just shown. Deliberately not
  // inside the fetch effect above: that effect's job is "get the data", this one's is "the data
  // has now been shown to the student", and folding them together would record before render.
  useEffect(() => {
    if (!entries || entries.length === 0) return;
    recordLeaderboardRanks(scopeCacheKey, entries);
  }, [scopeCacheKey, entries]);

  function handleSelectScope(scope: string) {
    router.replace(
      scope === ALL_COURSES_SCOPE ? "/leaderboard" : `/leaderboard?courseId=${encodeURIComponent(scope)}`,
      { scroll: false },
    );
  }

  function handleRefresh() {
    if (!token || refreshing) return;
    setRefreshing(true);
    // Forces both caches this page reads: the course list (membership can have changed since
    // this session started) and the selected scope's entries — the one on-demand escape hatch
    // for both of the session caches GitHub #328 introduced.
    Promise.all([
      loadMyLeaderboardCourses(token, { forceRefresh: true }),
      selectedScope === ALL_COURSES_SCOPE
        ? loadGlobalLeaderboard(token, { forceRefresh: true })
        : loadCourseLeaderboard(token, selectedScope, { forceRefresh: true }),
    ]).then(([coursesResult, entriesResult]) => {
      setRefreshing(false);
      if (coursesResult.ok) setCourses(coursesResult.data.courses);
      if (!entriesResult.ok) {
        setEntriesFailed(true);
        return;
      }
      setEntriesFailed(false);
      setEntries(entriesResult.data.entries);
    });
  }

  const rows = entries ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = rows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const me = rows.find((entry) => entry.studentId === studentId) ?? null;
  const meOnPage = pageEntries.some((entry) => entry.studentId === studentId);

  // The redirect in useRequireRole runs in an effect, so rendering before it lands would flash
  // this page at an instructor.
  if (loading || !authorized) return null;

  return (
    <AppShell active="leaderboard">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1.5 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-extrabold text-brand-navy">
            Leaderboard
          </h1>
          {courses && courses.length > 0 ? (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing || entries === null}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-brand-purple hover:text-brand-purple disabled:opacity-40"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </div>
        <p className="mb-6 text-sm font-semibold text-gray-500">
          Ranked by cumulative score — your best result at each difficulty level
          of every activity, added up.
        </p>

        {coursesFailed ? (
          <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center">
            <p className="text-sm font-bold text-brand-navy">
              Could not load your courses.
            </p>
            <button
              type="button"
              onClick={() => {
                setCoursesFailed(false);
                setCourses(null);
              }}
              className="mt-4 inline-flex rounded-brand-md bg-brand-purple px-4 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
            >
              Retry
            </button>
          </div>
        ) : courses === null ? (
          <LeaderboardSkeleton />
        ) : courses.length === 0 ? (
          <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center">
            <p className="text-sm font-bold text-brand-navy">
              You&apos;re not in a course yet.
            </p>
            <p className="mt-1.5 text-sm font-semibold text-gray-500">
              A leaderboard ranks you against your classmates, so it needs a
              course first.
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
              selectedCourseId={selectedScope}
              onSelect={handleSelectScope}
            />

            {entriesFailed ? (
              <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center">
                <p className="text-sm font-bold text-brand-navy">
                  Could not load this leaderboard.
                </p>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="mt-4 inline-flex rounded-brand-md bg-brand-purple px-4 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
                >
                  Retry
                </button>
              </div>
            ) : entries === null ? (
              <LeaderboardSkeleton />
            ) : (
              <>
                <LeaderboardTable
                  entries={pageEntries}
                  currentStudentId={studentId}
                />

                {me && !meOnPage ? <YourPositionStrip entry={me} /> : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-gray-500">
                    {rows.length === 0
                      ? "0 students"
                      : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, rows.length)} of ${rows.length} students`}
                  </span>

                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
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
