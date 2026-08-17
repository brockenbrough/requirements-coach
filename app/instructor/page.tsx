'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AcSubmissionDetails } from '../../components/AcSubmissionDetails';
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
import { QuizAttemptDetails } from '../../components/QuizAttemptDetails';
import {
  loadLlmActivityStatistics,
  loadInstructorACSubmissions,
  type LlmActivityStatistics,
} from '../../lib/llmActivityClient';
import { summarizeStudents, toAcSubmissionRow, toQuizAttemptRow, type ActivityRow } from '../../lib/activityLogTypes';
import {
  loadInstructorActivities,
  loadInstructorStudents,
  type OwnedActivityTypeSummary,
  type StudentSummary,
} from '../../lib/sessionClient';
import { loadCourses, loadCourseStats, type CourseSummary, type CourseActivityStats } from '../../lib/courseClient';
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

  const [entries, setEntries] = useState<ActivityRow[] | null>(null);
  const [ownedActivityTypes, setOwnedActivityTypes] = useState<OwnedActivityTypeSummary[]>([]);
  const [allStudents, setAllStudents] = useState<StudentSummary[] | null>(null);
  const [acStatistics, setAcStatistics] = useState<LlmActivityStatistics | null>(null);
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseStats, setCourseStats] = useState<CourseActivityStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [studentId, setStudentId] = useState<StudentFilterValue>('all');
  const [level, setLevel] = useState<LevelFilterValue>('all');
  const [sort, setSort] = useState<InstructorSortOrder>('newest');
  const [page, setPage] = useState(1);

  /**
   * GitHub #276: quiz attempts (GET /api/instructor/activities) and Write Acceptance Criteria
   * submissions (GET /api/instructor/acceptance-criteria/submissions) are two separate routes —
   * there is no combined backend endpoint — so this fetches both in parallel and merges them
   * client-side into one ActivityRow[] list. A combined route would save a round trip, but isn't
   * worth adding for two lists this size; revisit if the class-wide read ever needs to page
   * server-side.
   *
   * Cache-first for the quiz attempts (forceRefresh on the Refresh button or when profile.user_id
   * becomes available for the first time); AC submissions are never cached (same as the page this
   * replaced), so they're always a fresh network read.
   */
  useEffect(() => {
    if (!token || !profile?.user_id) return;
    let cancelled = false;

    loadCourses(token).then((result) => {
      if (!cancelled && result.ok) setCourses(result.data.courses);
    });

    Promise.all([
      loadInstructorActivities(token, profile.user_id),
      loadInstructorACSubmissions(token),
      loadLlmActivityStatistics(token),
    ]).then(([activitiesResult, submissionsResult, statisticsResult]) => {
      if (cancelled) return;
      if (!activitiesResult.ok) {
        setError(activitiesResult.error);
        return;
      }
      if (!submissionsResult.ok) {
        setError(submissionsResult.error);
        return;
      }
      setEntries([
        ...activitiesResult.data.sessions.map(toQuizAttemptRow),
        ...submissionsResult.data.submissions.map(toAcSubmissionRow),
      ]);
      setOwnedActivityTypes(activitiesResult.data.ownedActivityTypes);
      // A failed statistics fetch costs the participation metric, not the whole dashboard —
      // InstructorActivityStats renders a placeholder for a null value.
      if (statisticsResult.ok) setAcStatistics(statisticsResult.data.statistics);
    });

    return () => {
      cancelled = true;
    };
  }, [token, profile?.user_id]);

  async function handleSelectCourse(courseId: string | null) {
    if (!token) return;
    setSelectedCourseId(courseId);
    if (!courseId) { setCourseStats(null); return; }
    const result = await loadCourseStats(token, courseId);
    if (result.ok) setCourseStats(result.data.statistics);
  }

  function handleRefresh() {
    if (!token || !profile?.user_id || refreshing) return;
    setRefreshing(true);
    Promise.all([
      loadInstructorActivities(token, profile.user_id, { forceRefresh: true }),
      loadInstructorACSubmissions(token),
      loadLlmActivityStatistics(token),
    ]).then(([activitiesResult, submissionsResult, statisticsResult]) => {
      setRefreshing(false);
      if (!activitiesResult.ok) {
        setError(activitiesResult.error);
        return;
      }
      if (!submissionsResult.ok) {
        setError(submissionsResult.error);
        return;
      }
      setEntries([
        ...activitiesResult.data.sessions.map(toQuizAttemptRow),
        ...submissionsResult.data.submissions.map(toAcSubmissionRow),
      ]);
      setOwnedActivityTypes(activitiesResult.data.ownedActivityTypes);
      if (statisticsResult.ok) setAcStatistics(statisticsResult.data.statistics);
      setError(null);
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

  // Merges in allStudents so an enrolled student with zero attempts still gets a card here,
  // the same fix app/instructor/students/page.tsx already applies — without this, the dashboard
  // roster silently drops every student who hasn't started an activity yet (GitHub #415).
  const rosterEntries = useMemo(
    () =>
      (allStudents ?? []).map((s) => ({
        studentId: s.userId,
        studentName: `${s.firstName} ${s.lastName}`.trim() || s.username,
      })),
    [allStudents],
  );

  const roster = useMemo(() => summarizeStudents(entries ?? [], rosterEntries), [entries, rosterEntries]);

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
          Activity on quizzes and catalogs you created — filter by student or level, or sort to surface who needs a
          hand.
        </p>

        {courses && courses.length > 0 ? (
          <div className="mb-8">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wide text-gray-400">My Courses</h2>
              <Link href="/instructor/courses" className="text-xs font-bold text-brand-purple hover:underline">
                View all courses →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => {
                const selected = selectedCourseId === course.id;
                return (
                  <div
                    key={course.id}
                    className={`rounded-brand-lg border p-4 shadow-sm transition ${selected ? 'border-brand-purple bg-brand-purple/5' : 'border-gray-100 bg-white'}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectCourse(selected ? null : course.id)}
                      className="w-full text-left"
                    >
                      <p className="mb-1 font-extrabold text-brand-navy">{course.name}</p>
                      <p className="mb-2 text-sm font-semibold text-gray-500">
                        {course.studentCount} {course.studentCount === 1 ? 'student' : 'students'} enrolled
                      </p>
                    </button>
                    <Link
                      href={`/instructor/courses/${course.id}`}
                      className="text-xs font-bold text-brand-purple hover:underline"
                    >
                      View roster →
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            {error}
          </p>
        ) : entries === null ? (
          <InstructorDashboardSkeleton />
        ) : entries.length === 0 && ownedActivityTypes.length === 0 ? (
          // Both zero attempts AND zero owned catalogs — genuinely nothing to show. An instructor
          // who owns a catalog but has no attempts yet does NOT hit this branch: they still get a
          // real stat card (with '—' placeholders, GitHub #171 follow-up) rather than being told
          // there's nothing here. Rendering the full dashboard when there's truly nothing at all
          // would show the table's "No attempts match these filters." message, which blames
          // filters the instructor never set (GitHub #174).
          <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-10 text-center">
            <p className="text-sm font-extrabold text-brand-navy">No activity yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm font-semibold text-gray-500">
              Once students start an activity, their attempts show up here.
            </p>
          </div>
        ) : (
          <>
            {selectedCourseId ? (
              <InstructorActivityStats
                entries={entries}
                ownedActivityTypes={ownedActivityTypes}
                acParticipation={null}
                courseStats={courseStats}
              />
            ) : null}

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

            <ActivityLogTable
              entries={pageEntries}
              getStudentName={(entry) => studentNameById.get(entry.studentId) ?? ''}
              renderDetail={(entry) =>
                entry.kind === 'ac-submission' ? (
                  <AcSubmissionDetails submission={entry} />
                ) : (
                  <QuizAttemptDetails sessionId={entry.id} token={token!} />
                )
              }
            />

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
