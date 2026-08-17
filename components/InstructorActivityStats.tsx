import type { OwnedActivityTypeSummary } from '../lib/activityTypeQueries';
import type { StudentActivitySummary } from '../lib/activityLogTypes';

/**
 * Class-wide average score and pass rate per activity type — the baseline an instructor reads
 * individual students against.
 *
 * One card per catalog this instructor actually created (GitHub #171 follow-up) — ownedActivityTypes
 * comes straight from GET /api/instructor/activities' response, not the hardcoded ACTIVITIES array
 * this used to iterate, which rendered a card for all 3 built-ins regardless of ownership. An
 * instructor with no catalogs of their own renders no cards at all, and a just-created catalog
 * with zero attempts yet still gets a card (with '—' placeholders) since it comes from the owned
 * list, not from entries.
 *
 * acParticipation adds a third metric to an llm-graded card only (GitHub #317 — that activity used
 * to get its own second card with average score + participation; the average score duplicated
 * this card's class-average as a /10 instead of a %, so only participation survives, folded in
 * here instead of a separate view). Since GitHub #379, CreateCatalogModal lets an instructor
 * choose 'llm-graded' at creation, so this branch is reachable in practice, not just kept for
 * later — acParticipation is computeLlmActivityStatistics' own studentsAttempted/roster-size pair
 * (lib/llmActivityStatisticsQueries.ts), scoped the same way the cards themselves are.
 */
export function InstructorActivityStats({
  entries,
  ownedActivityTypes,
  acParticipation,
}: {
  entries: StudentActivitySummary[];
  ownedActivityTypes: OwnedActivityTypeSummary[];
  acParticipation: { attempted: number; total: number } | null;
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {ownedActivityTypes.map((activity) => {
        const completed = entries.filter((entry) => entry.activityType === activity.activityType && entry.status === 'completed' && entry.maxScore > 0);
        const average =
          completed.length === 0
            ? null
            : Math.round(completed.reduce((sum, entry) => sum + (entry.score / entry.maxScore) * 100, 0) / completed.length);
        const passRate =
          completed.length === 0 ? null : Math.round((completed.filter((entry) => entry.passed).length / completed.length) * 100);
        const participationLabel =
          activity.gradingKind === 'llm-graded' && acParticipation !== null
            ? `${acParticipation.attempted} of ${acParticipation.total}`
            : null;

        return (
          <div key={activity.activityType} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
            <p className="text-sm font-extrabold text-brand-navy">{activity.name}</p>
            <div className="mt-3 flex gap-8">
              <div>
                <div className="text-xl font-extrabold tabular-nums text-brand-navy">{average === null ? '—' : `${average}%`}</div>
                <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-400">Class average</div>
              </div>
              <div>
                <div className="text-xl font-extrabold tabular-nums text-brand-teal-dark">{passRate === null ? '—' : `${passRate}%`}</div>
                <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-400">Pass rate</div>
              </div>
              {participationLabel !== null ? (
                <div>
                  <div className="text-xl font-extrabold tabular-nums text-brand-navy">{participationLabel}</div>
                  <div className="mt-0.5 text-xs font-bold uppercase tracking-wide text-gray-400">Participation</div>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
