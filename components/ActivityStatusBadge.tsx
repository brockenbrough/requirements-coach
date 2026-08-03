import type { ActivityResultState } from '../lib/activityLogTypes';

const BADGE_CLASSES: Record<ActivityResultState, string> = {
  passed: 'bg-brand-teal/20 text-brand-teal-dark',
  'not-passed': 'bg-brand-gold/25 text-brand-gold-dark',
  abandoned: 'bg-brand-danger/15 text-brand-danger',
  'in-progress': 'bg-brand-purple/20 text-brand-purple-dark',
};

const DOT_CLASSES: Record<ActivityResultState, string> = {
  passed: 'bg-brand-teal',
  'not-passed': 'bg-brand-gold',
  abandoned: 'bg-brand-danger',
  'in-progress': 'bg-brand-purple animate-pulse',
};

const LABELS: Record<ActivityResultState, string> = {
  passed: 'Passed',
  'not-passed': 'Not passed',
  abandoned: 'Abandoned',
  'in-progress': 'In progress',
};

/** Same pill everywhere a log entry's outcome shows — the table, the dashboard preview, filters. */
export function ActivityStatusBadge({ state }: { state: ActivityResultState }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold ${BADGE_CLASSES[state]}`}
    >
      <span className={`h-1.5 w-1.5 flex-none rounded-full ${DOT_CLASSES[state]}`} />
      {LABELS[state]}
    </span>
  );
}
