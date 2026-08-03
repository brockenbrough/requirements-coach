import { resultStateOf, type ActivityLogEntry } from '../lib/activityLogTypes';

/** Total/Passed/Abandoned tiles above the Activity Log table — always over every entry, never the filtered subset, so the numbers don't change meaning depending on what's currently filtered. */
export function ActivityStatsCards({ entries }: { entries: ActivityLogEntry[] }) {
  const total = entries.length;
  const passed = entries.filter((entry) => resultStateOf(entry) === 'passed').length;
  const abandoned = entries.filter((entry) => entry.status === 'abandoned').length;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
        <div className="text-2xl font-extrabold tabular-nums text-brand-navy">{total}</div>
        <div className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">Total attempts</div>
      </div>
      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
        <div className="text-2xl font-extrabold tabular-nums text-brand-teal-dark">{passed}</div>
        <div className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">Passed</div>
      </div>
      <div className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
        <div className="text-2xl font-extrabold tabular-nums text-brand-danger">{abandoned}</div>
        <div className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-400">Abandoned</div>
      </div>
    </div>
  );
}
