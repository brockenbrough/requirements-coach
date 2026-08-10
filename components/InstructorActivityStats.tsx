import { ACTIVITIES } from '../lib/activityContent';
import type { StudentActivitySummary } from '../lib/activityLogTypes';

/** Class-wide average score and pass rate per activity type — the baseline an instructor reads individual students against. */
export function InstructorActivityStats({ entries }: { entries: StudentActivitySummary[] }) {
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
