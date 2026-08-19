'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { ActivityLogTable } from '../../../../components/ActivityLogTable';
import { StudentActivityBreakdown } from '../../../../components/StudentActivityBreakdown';
import { StudentDetailHeader } from '../../../../components/StudentDetailHeader';
import { StudentMetricCards } from '../../../../components/StudentMetricCards';
import { StudentScoreChart } from '../../../../components/StudentScoreChart';
import { useUser } from '../../../../components/UserProvider';
import { computeStudentMetrics } from '../../../../lib/studentAttemptMetrics';
import { loadStudentDetail, type StudentDetail } from '../../../../lib/sessionClient';
import { useRequireRole } from '../../../../lib/useRequireRole';

// useSearchParams() (the ?name= the referring card passed along) opts this page out of static
// rendering unless wrapped in Suspense — same reason app/instructor/page.tsx needs it for ?student=.
export default function StudentDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <StudentDetailContent studentId={params.id} />
    </Suspense>
  );
}

function NoAccessCard() {
  return (
    <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-8 text-center">
      <p className="text-sm font-extrabold text-brand-navy">This student isn&apos;t available.</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm font-semibold text-gray-500">
        This student doesn&apos;t exist, or isn&apos;t enrolled in any course you teach.
      </p>
      <Link
        href="/instructor/students"
        className="mt-4 inline-flex rounded-brand-md bg-brand-purple px-4 py-2 text-sm font-extrabold text-white hover:bg-brand-purple-dark"
      >
        Back to Students
      </Link>
    </div>
  );
}

function StudentDetailContent({ studentId }: { studentId: string }) {
  // Same instructor-only guard as every other /instructor/* page (GitHub #82/#169) — a student
  // hitting this URL directly is redirected, never shown another student's activity.
  const { loading, authorized } = useRequireRole('instructor');
  const { token } = useUser();
  const searchParams = useSearchParams();

  // Carried over via the referring card's link (components/InstructorStudentCard.tsx) so the
  // header has a name to show before the real fetch below resolves; the real studentName from
  // the API (once loaded) takes over so this page never shows a stale name for a reused link.
  const fallbackName = searchParams.get('name') || 'This student';

  // undefined = not fetched yet, null = fetched and unavailable (unknown id, or no shared
  // course with this instructor — both collapse to the same NoAccessCard, same privacy reasoning
  // as app/students/[id]/page.tsx's NotFoundCard for a peer profile).
  const [detail, setDetail] = useState<StudentDetail | null | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setDetail(undefined);

    loadStudentDetail(token, studentId).then((result) => {
      if (cancelled) return;
      setDetail(result.ok ? result.data : null);
    });

    return () => {
      cancelled = true;
    };
  }, [token, studentId]);

  const attempts = useMemo(() => detail?.attempts ?? [], [detail]);
  const studentName = detail?.studentName ?? fallbackName;
  const metrics = useMemo(() => computeStudentMetrics(studentId, studentName, attempts), [studentId, studentName, attempts]);

  if (loading || !authorized) return null;

  const detailLoading = detail === undefined;

  const summaryLine = `${metrics.abandonedCount > 0 ? `${attempts.length} attempts · ${metrics.abandonedCount} abandoned` : `${attempts.length} attempts`}`;

  return (
    <AppShell active="instructor">
      <div className="mx-auto max-w-5xl">
        {detailLoading || !detail ? (
          <Link href="/instructor/students" className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-brand-navy">
            ← Back to Students
          </Link>
        ) : null}

        {detailLoading ? (
          <p className="py-8 text-center text-sm font-semibold text-gray-500">Loading student…</p>
        ) : !detail ? (
          <NoAccessCard />
        ) : (
          <>
            <StudentDetailHeader studentName={studentName} needsAttention={metrics.needsAttention} summaryLine={summaryLine} />

            <StudentMetricCards metrics={metrics} classAverage={detail.classAveragePercent} />

            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
              <StudentScoreChart attempts={attempts} />
              <StudentActivityBreakdown attempts={attempts} />
            </div>

            <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">All attempts</p>
            <ActivityLogTable entries={attempts} getCourses={(entry) => entry.courses} />
          </>
        )}
      </div>
    </AppShell>
  );
}
