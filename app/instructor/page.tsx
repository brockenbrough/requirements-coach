'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AcSubmissionDetails } from '../../components/AcSubmissionDetails';
import { AppShell } from '../../components/AppShell';
import { ActivityLogTable } from '../../components/ActivityLogTable';
import {
  InstructorFilters,
  type CourseFilterValue,
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
import {
  loadCourses,
  loadCourseStats,
  loadAllCourseClassStats,
  type CourseSummary,
  type CourseActivityStats,
  type CourseClassStats as CourseClassStatsData,
} from '../../lib/courseClient';
import { CourseCard } from '../../components/CourseCard';
import { DeleteCourseModal } from '../../components/DeleteCourseModal';
import { DuplicateCourseModal } from '../../components/DuplicateCourseModal';
import { EditCourseModal } from '../../components/EditCourseModal';
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
  const [courseClassStatsById, setCourseClassStatsById] = useState<Record<string, CourseClassStatsData> | null>(null);
  const [duplicateSource, setDuplicateSource] = useState<CourseSummary | null>(null);
  const [editSource, setEditSource] = useState<CourseSummary | null>(null);
  const [deleteSource, setDeleteSource] = useState<CourseSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [studentId, setStudentId] = useState<StudentFilterValue>('all');
  const [level, setLevel] = useState<LevelFilterValue>('all');
  // Empty until courses load, then auto-set to the first owned course below — there is no "all
  // courses" state any more (see ownedEntries' own comment for why).
  const [courseFilterId, setCourseFilterId] = useState<CourseFilterValue>('');
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

    loadAllCourseClassStats(token).then((result) => {
      if (!cancelled && result.ok) {
        setCourseClassStatsById(Object.fromEntries(result.data.stats.map((s) => [s.courseId, s])));
      }
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
    // Reset to the loading state before the fetch, not just on deselect — otherwise the
    // previously-selected course's stats would flash inside the newly-selected card for a moment
    // (GitHub #423: these render inside the specific CourseCard now, so stale data would show up
    // in the wrong card, not just in a page-level block no one's card owns).
    setCourseStats(null);
    if (!courseId) return;
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

  // GET /api/instructor/activities is scoped by which catalogs this instructor created
  // (creator_id), not which courses they own — a catalog reused by a colleague's assembled quiz
  // still counts as "mine" there, so every student who took it through the colleague's course
  // leaked into this dashboard too. courses (loadCourses) is genuinely course-ownership-scoped, so
  // filtering entries down to only the ones tied to one of *those* course ids closes the gap: an
  // instructor now only ever sees activity that happened in a course they actually created.
  // Gated on both being loaded (not just entries) so this doesn't render a false "nothing here" a
  // moment before courses arrives.
  const ownedEntries = useMemo(() => {
    if (entries === null || courses === null) return null;
    const ownedCourseIds = new Set(courses.map((c) => c.id));
    return entries.filter((entry) => entry.courses.some((course) => ownedCourseIds.has(course.courseId)));
  }, [entries, courses]);

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

  const roster = useMemo(() => summarizeStudents(ownedEntries ?? [], rosterEntries), [ownedEntries, rosterEntries]);

  // Used by ActivityLogTable to resolve a student name for each attempt row.
  const studentNameById = useMemo(
    () => new Map((ownedEntries ?? []).map((entry) => [entry.studentId, entry.studentName])),
    [ownedEntries],
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

  // No "all courses" state any more (see ownedEntries above) — default the Course filter to the
  // instructor's own first course once it's loaded, rather than leaving it unset.
  useEffect(() => {
    if (courses && courses.length > 0 && !courseFilterId) {
      setCourseFilterId(courses[0].id);
    }
  }, [courses, courseFilterId]);

  const filteredSorted = useMemo(() => {
    const rows = (ownedEntries ?? []).filter((entry) => {
      if (studentId !== 'all' && entry.studentId !== studentId) return false;
      if (level !== 'all' && entry.level !== level) return false;
      // A catalog can be linked to more than one course at once (GitHub #474), so "filter to
      // course X" means "X is among this attempt's courses", not "X is its only course".
      if (courseFilterId && !entry.courses.some((course) => course.courseId === courseFilterId)) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (sort === 'oldest') return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
      if (sort === 'lowest') return a.score - b.score;
      if (sort === 'highest') return b.score - a.score;
      return new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime();
    });
  }, [ownedEntries, studentId, level, courseFilterId, sort]);

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

  function handleCourseFilterChange(value: CourseFilterValue) {
    setCourseFilterId(value);
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
            disabled={refreshing || ownedEntries === null}
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
              {courses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  classStats={courseClassStatsById?.[course.id] ?? null}
                  activityStats={selectedCourseId === course.id ? courseStats : undefined}
                  statsExpanded={selectedCourseId === course.id}
                  onToggleStats={(c) => handleSelectCourse(selectedCourseId === c.id ? null : c.id)}
                  onDuplicate={setDuplicateSource}
                  onEdit={setEditSource}
                  onDelete={setDeleteSource}
                />
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mb-6 rounded-brand-lg border border-brand-danger/40 bg-brand-danger/10 p-4 text-sm font-semibold text-brand-danger-light">
            {error}
          </p>
        ) : ownedEntries === null ? (
          <InstructorDashboardSkeleton />
        ) : ownedEntries.length === 0 && ownedActivityTypes.length === 0 ? (
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
              courses={(courses ?? []).map((c) => ({ id: c.id, name: c.name }))}
              courseId={courseFilterId}
              sort={sort}
              onStudentChange={handleStudentChange}
              onLevelChange={handleLevelChange}
              onCourseChange={handleCourseFilterChange}
              onSortChange={setSort}
            />

            <ActivityLogTable
              entries={pageEntries}
              getStudentName={(entry) => studentNameById.get(entry.studentId) ?? ''}
              getCourses={(entry) => entry.courses}
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

      {duplicateSource && token ? (
        <DuplicateCourseModal
          course={duplicateSource}
          token={token}
          onClose={() => setDuplicateSource(null)}
          onCreated={(course) => setCourses((current) => [course, ...(current ?? [])])}
        />
      ) : null}

      {editSource && token ? (
        <EditCourseModal
          course={editSource}
          token={token}
          onClose={() => setEditSource(null)}
          onSaved={(updated) =>
            setCourses((current) =>
              (current ?? []).map((c) =>
                c.id === updated.id ? { ...c, name: updated.name, semester: updated.semester, coverImageUrl: updated.coverImageUrl } : c,
              ),
            )
          }
        />
      ) : null}

      {deleteSource && token ? (
        <DeleteCourseModal
          course={{ id: deleteSource.id, name: deleteSource.name, studentCount: deleteSource.studentCount }}
          token={token}
          onClose={() => setDeleteSource(null)}
          onDeleted={() => {
            setCourses((current) => (current ?? []).filter((c) => c.id !== deleteSource.id));
            if (selectedCourseId === deleteSource.id) setSelectedCourseId(null);
            setDeleteSource(null);
          }}
        />
      ) : null}
    </AppShell>
  );
}
