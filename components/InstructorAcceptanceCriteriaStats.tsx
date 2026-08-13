import type { AcceptanceCriteriaStatistics } from '../lib/acceptanceCriteriaClient';

/**
 * Class-wide stats for the write-acceptance-criteria activity (GitHub #155), mirroring
 * InstructorActivityStats's two-metric-per-card layout: average score and participation.
 *
 * statistics arrives already aggregated (GET /api/instructor/acceptance-criteria/statistics,
 * lib/acceptanceCriteriaStatisticsQueries.ts) — this component only formats it, the same
 * division of responsibility as InstructorActivityStats keeps with its own class-average math
 * (which it can do client-side only because it's a cheap reduce over an already-fetched list;
 * this activity's full submission list isn't fetched here at all).
 *
 * totalStudents is passed in rather than fetched again — the roster count app/instructor/
 * page.tsx already loads for the student list below.
 */
export function InstructorAcceptanceCriteriaStats({
  statistics,
  totalStudents,
}: {
  statistics: AcceptanceCriteriaStatistics | null;
  totalStudents: number | null;
}) {
  // Dash while unknown, never a flash of 0 — same convention as AppShell.tsx's score pill.
  const averageLabel = statistics?.averageScore == null ? '—' : `${statistics.averageScore.toFixed(1)}/10`;
  const participationLabel =
    statistics === null || totalStudents === null
      ? '—'
      : `${statistics.studentsAttempted} of ${totalStudents}`;

  // byUserStory is already sorted lowest-average-first with null-average (never-attempted)
  // entries last (lib/acceptanceCriteriaStatisticsQueries.ts), so the first graded entry here
  // is exactly the one that needs attention.
  const needsAttention = statistics?.byUserStory.find((story) => story.averageScore !== null) ?? null;

  return (
    <div className="mb-6">
      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
        <p className="text-sm font-extrabold text-brand-navy">Write Acceptance Criteria</p>
        <div className="mt-3 flex gap-8">
          <div>
            <div className="text-xl font-extrabold tabular-nums text-brand-navy">{averageLabel}</div>
            <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-400">Average score</div>
          </div>
          <div>
            <div className="text-xl font-extrabold tabular-nums text-brand-teal-dark">{participationLabel}</div>
            <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-400">Participation</div>
          </div>
        </div>
      </div>

      {needsAttention ? (
        <p className="mt-2 truncate rounded-brand-md border border-brand-danger/40 bg-brand-danger/10 px-3 py-1.5 text-xs font-bold text-brand-danger-light">
          Needs attention: {needsAttention.storyText}
        </p>
      ) : null}
    </div>
  );
}
