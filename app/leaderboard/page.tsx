"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { LeaderboardCourseSwitcher } from "../../components/LeaderboardCourseSwitcher";
import { LeaderboardSkeleton } from "../../components/LeaderboardSkeleton";
import {
  LeaderboardTable,
  YourPositionStrip,
} from "../../components/LeaderboardTable";
import { Pagination } from "../../components/Pagination";
import {
  loadCourseLeaderboard,
  loadJoinableCourses,
} from "../../lib/studentCourseClient";
import { recordLeaderboardRanks } from "../../lib/previousRankStore";
import type {
  LeaderboardCourse,
  LeaderboardEntry,
} from "../../lib/leaderboardTypes";
import { useRequireRole } from "../../lib/useRequireRole";

const PAGE_SIZE = 10; // keep in sync with ROW_COUNT in components/LeaderboardSkeleton.tsx

/**
 * The course leaderboard: where a student stands against their classmates.
 *
 * Reads GET /api/courses/{courseId}/leaderboard via lib/studentCourseClient.ts's
 * loadCourseLeaderboard. rankChange is attached by that client call from
 * lib/previousRankStore.ts's last-recorded snapshot; this page
 * is what records the NEW snapshot, once per fresh fetch, after the entries carrying the old
 * snapshot's deltas have rendered — see the effect below and recordLeaderboardRanks's own doc.
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

  // The course list a student can see a leaderboard for is exactly "my courses" — the same
  // alreadyMember filter components/MyCoursesSection.tsx already applies to
  // loadJoinableCourses's response, since that's the only real "which courses is this student
  // in" source that exists (GET /api/courses, not a dedicated "my courses" route).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    loadJoinableCourses(token).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setCoursesFailed(true);
        return;
      }
      setCourses(
        result.data.courses
          .filter((course) => course.alreadyMember)
          .map((course) => ({ courseId: course.id, courseName: course.name })),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const courseIdParam = searchParams.get("courseId");
  // An unknown ?courseId= falls back to the first course rather than showing an empty page for
  // a course the student isn't in — the switcher then re-syncs the URL below.
  const selectedCourseId = courses
    ? (courses.find((course) => course.courseId === courseIdParam)?.courseId ??
      courses[0]?.courseId ??
      null)
    : null;

  useEffect(() => {
    if (!token || !selectedCourseId) {
      setEntries(courses && courses.length === 0 ? [] : null);
      return;
    }

    let cancelled = false;
    setEntries(null);
    setEntriesFailed(false);
    setPage(1);

    loadCourseLeaderboard(token, selectedCourseId).then((result) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedCourseId]);

  // Records THIS render's ranks as the new "previous" snapshot, once per fresh, non-empty fetch —
  // never during the fetch that produced the rankChange values just shown. Deliberately not
  // inside the fetch effect above: that effect's job is "get the data", this one's is "the data
  // has now been shown to the student", and folding them together would record before render.
  useEffect(() => {
    if (!selectedCourseId || !entries || entries.length === 0) return;
    recordLeaderboardRanks(selectedCourseId, entries);
  }, [selectedCourseId, entries]);

  function handleSelectCourse(courseId: string) {
    router.replace(`/leaderboard?courseId=${encodeURIComponent(courseId)}`, {
      scroll: false,
    });
  }

  function handleRefresh() {
    if (!token || !selectedCourseId || refreshing) return;
    setRefreshing(true);
    loadCourseLeaderboard(token, selectedCourseId, { forceRefresh: true }).then(
      (result) => {
        setRefreshing(false);
        if (!result.ok) {
          setEntriesFailed(true);
          return;
        }
        setEntriesFailed(false);
        setEntries(result.data.entries);
      },
    );
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
              selectedCourseId={selectedCourseId}
              onSelect={handleSelectCourse}
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
