import { ACTIVITIES } from '../lib/activityContent';
import type { StudentActivitySummary } from '../lib/activityLogTypes';

/**
 * Class-wide average score and pass rate per activity type — the baseline an instructor reads
 * individual students against.
 *
 * acParticipation adds a third metric to the write-acceptance-criteria card only (GitHub #317
 * — that activity used to get its own second card with average score + participation; the
 * average score duplicated this card's class-average as a /10 instead of a %, so only
 * participation survives, folded in here instead of a separate view).
 */
export function InstructorActivityStats({
  entries,
  acParticipation,
}: {
  entries: StudentActivitySummary[];
  acParticipation: { attempted: number; total: number } | null;
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {ACTIVITIES.map((activity) => {
        const completed = entries.filter((entry) => entry.activityType === activity.activityType && entry.status === 'completed' && entry.maxScore > 0);
        const average =
          completed.length === 0
            ? null
            : Math.round(completed.reduce((sum, entry) => sum + (entry.score / entry.maxScore) * 100, 0) / completed.length);
        const passRate =
          completed.length === 0 ? null : Math.round((completed.filter((entry) => entry.passed).length / completed.length) * 100);
        const participationLabel =
          activity.slug === 'write-acceptance-criteria' && acParticipation !== null
            ? `${acParticipation.attempted} of ${acParticipation.total}`
            : null;

        return (
          <div key={activity.slug} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
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
