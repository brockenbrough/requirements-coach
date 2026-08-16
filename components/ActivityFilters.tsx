import type { ActivityType } from '../lib/activityTypes';
import type { ActivityResultState } from '../lib/activityLogTypes';

export type ActivityFilterValue = 'all' | ActivityType;
export type StatusFilterValue = 'all' | ActivityResultState;
export type SortOrder = 'newest' | 'oldest' | 'highest' | 'lowest';

const STATUS_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'passed', label: 'Passed' },
  { value: 'not-passed', label: 'Not passed' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'abandoned', label: 'Abandoned' },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'highest', label: 'Highest score' },
  { value: 'lowest', label: 'Lowest score' },
];

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
        active
          ? 'border-brand-purple bg-brand-purple text-white'
          : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Activity + status filters (pills, so the current selection reads at a glance) plus a sort order
 * — all controlled from the Activity Log page so filtering/sorting stays a single, testable state
 * object. `activityOptions` is the caller's derived "what has this student actually attempted"
 * list (lib/activityLogTypes.ts's deriveActivityFilterOptions) — "All" is injected here rather
 * than required from the caller, so it can never be dropped and an empty `activityOptions` still
 * renders a usable (if single-pill) filter.
 */
export function ActivityFilters({
  activity,
  activityOptions,
  status,
  sort,
  onActivityChange,
  onStatusChange,
  onSortChange,
}: {
  activity: ActivityFilterValue;
  activityOptions: { value: ActivityFilterValue; label: string }[];
  status: StatusFilterValue;
  sort: SortOrder;
  onActivityChange: (value: ActivityFilterValue) => void;
  onStatusChange: (value: StatusFilterValue) => void;
  onSortChange: (value: SortOrder) => void;
}) {
  const allActivityOptions: { value: ActivityFilterValue; label: string }[] = [
    { value: 'all', label: 'All' },
    ...activityOptions,
  ];

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">Activity</span>
          {allActivityOptions.map((option) => (
            <PillButton key={option.value} active={activity === option.value} onClick={() => onActivityChange(option.value)}>
              {option.label}
            </PillButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">Status</span>
          {STATUS_OPTIONS.map((option) => (
            <PillButton key={option.value} active={status === option.value} onClick={() => onStatusChange(option.value)}>
              {option.label}
            </PillButton>
          ))}
        </div>
      </div>

      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SortOrder)}
        className="rounded-brand-md border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-600 outline-none transition focus:border-brand-purple"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
