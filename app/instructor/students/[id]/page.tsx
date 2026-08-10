'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { AppShell } from '../../../../components/AppShell';
import { ActivityLogTable } from '../../../../components/ActivityLogTable';
import { StudentActivityBreakdown } from '../../../../components/StudentActivityBreakdown';
import { StudentDetailHeader } from '../../../../components/StudentDetailHeader';
import { StudentMetricCards } from '../../../../components/StudentMetricCards';
import { StudentScoreChart } from '../../../../components/StudentScoreChart';
import { computeStudentMetrics } from '../../../../lib/studentAttemptMetrics';
import { getMockStudentAttempts } from '../../../../lib/mockStudentAttempts';
import { useRequireRole } from '../../../../lib/useRequireRole';

// Placeholder for the class-wide average a real backend would compute the same way
// components/InstructorActivityStats.tsx already does on the dashboard (class average per
// activity type, from every student's real completed sessions) — there's no second mock
// student here to average over, so this one number stays a fixed stand-in until that endpoint
// covers a single student's page too.
const MOCK_CLASS_AVERAGE = 74;

// useSearchParams() (the ?name= the referring card passed along) opts this page out of static
// rendering unless wrapped in Suspense — same reason app/instructor/page.tsx needs it for ?student=.
export default function StudentDetailPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <StudentDetailContent studentId={params.id} />
    </Suspense>
  );
}

function StudentDetailContent({ studentId }: { studentId: string }) {
  // Same instructor-only guard as every other /instructor/* page (GitHub #82/#169) — a student
  // hitting this URL directly is redirected, never shown another student's activity.
  const { loading, authorized } = useRequireRole('instructor');
  const searchParams = useSearchParams();

  // GitHub #127: UI-only pass — no per-student attempts endpoint exists yet, so this reads mock
  // data instead of fetching by studentId (see lib/mockStudentAttempts.ts's docstring for what a
  // real integration needs to change). The name is carried over via the referring card's link
  // (components/InstructorStudentCard.tsx) rather than looked up here, since there's nothing
  // real to look it up against yet either.
  const studentName = searchParams.get('name') || 'This student';

  const attempts = useMemo(() => getMockStudentAttempts(), []);
  const metrics = useMemo(() => computeStudentMetrics(studentId, studentName, attempts), [studentId, studentName, attempts]);

  if (loading || !authorized) return null;

  const summaryLine = `${metrics.abandonedCount > 0 ? `${attempts.length} attempts · ${metrics.abandonedCount} abandoned` : `${attempts.length} attempts`}`;

  return (
    <AppShell active="instructor">
      <div className="mx-auto max-w-5xl">
        <StudentDetailHeader studentName={studentName} needsAttention={metrics.needsAttention} summaryLine={summaryLine} />

        <StudentMetricCards metrics={metrics} classAverage={MOCK_CLASS_AVERAGE} />

        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <StudentScoreChart attempts={attempts} />
          <StudentActivityBreakdown attempts={attempts} />
        </div>

        <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-gray-400">All attempts</p>
        <ActivityLogTable entries={attempts} />
      </div>
    </AppShell>
  );
}
