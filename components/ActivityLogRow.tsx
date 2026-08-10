import { CategoryIcon } from './ActivityCard';
import { ActivityStatusBadge } from './ActivityStatusBadge';
import { getActivityByType } from '../lib/activityContent';
import { resultStateOf, type ActivityLogEntry, type ActivityResultState } from '../lib/activityLogTypes';

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const LEVEL_CLASSES: Record<1 | 2 | 3, string> = {
  1: 'bg-brand-green/20 text-brand-green-dark',
  2: 'bg-brand-teal/20 text-brand-teal-dark',
  3: 'bg-brand-gold/25 text-brand-gold-dark',
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

function scoreText(entry: ActivityLogEntry, state: ActivityResultState) {
  if (state === 'in-progress') return `${entry.answeredQuestions} of ${entry.totalQuestions} answered`;
  if (state === 'abandoned') return `${entry.score}/${entry.maxScore} · ${entry.answeredQuestions} of ${entry.totalQuestions}`;
  return `${entry.score}/${entry.maxScore}`;
}

/**
 * One attempt, rendered either as a table row (ActivityLogTable, the full /dashboard/log page)
 * or as a compact stacked block (the dashboard's "Recent activity" preview, ~240px wide). Both
 * variants share the same badge and score logic so the two views can never disagree about what
 * "Passed" or a given score actually means.
 */
export function ActivityLogRow({
  entry,
  variant = 'table',
  studentName,
}: {
  entry: ActivityLogEntry;
  variant?: 'table' | 'compact';
  /** Instructor Dashboard only (GitHub #82): renders a leading Student column in the table variant. */
  studentName?: string;
}) {
  const state = resultStateOf(entry);
  const category = getActivityByType(entry.activityType)?.category ?? '';
  const when = formatDateTime(entry.dateTime);

  if (variant === 'compact') {
    return (
      <div className="border-t border-brand-navy-border py-3 first:border-t-0 first:pt-0">
        <p className="mb-1.5 truncate text-sm font-extrabold text-white">{entry.activityName}</p>
        <div className="mb-1 flex items-center justify-between gap-2">
          <ActivityStatusBadge state={state} />
          <span className="whitespace-nowrap text-xs font-bold text-brand-ink-muted">{scoreText(entry, state)}</span>
        </div>
        <p className="text-xs font-semibold text-brand-ink-muted">
          {when.date} · {when.time}
        </p>
      </div>
    );
  }

  return (
    <tr className="border-t border-brand-navy-border bg-brand-navy-2 text-brand-ink">
      {studentName ? <td className="whitespace-nowrap px-4 py-3.5 font-bold text-white">{studentName}</td> : null}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-9 w-9 flex-none items-center justify-center rounded-brand-md ${
              category === 'Acceptance Criteria' ? 'bg-brand-teal/15' : 'bg-brand-purple/15'
            }`}
          >
            <CategoryIcon category={category} />
          </span>
          <div>
            <div className="font-extrabold text-white">{entry.activityName}</div>
            <div className="text-xs font-semibold text-brand-ink-muted">{category}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-extrabold ${LEVEL_CLASSES[entry.level]}`}>
          {LEVEL_LABEL[entry.level]} · Level {entry.level}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5">
        <div className="font-bold tabular-nums">{when.date}</div>
        <div className="text-xs tabular-nums text-brand-ink-muted">{when.time}</div>
      </td>
      <td className="px-4 py-3.5">
        <div className="whitespace-nowrap font-bold tabular-nums">
          {entry.score}/{entry.maxScore}
        </div>
        <div className="mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-brand-navy-border">
          <span
            className={`block h-full rounded-full ${
              state === 'passed' ? 'bg-brand-teal' : state === 'in-progress' ? 'bg-brand-purple' : 'bg-brand-danger'
            }`}
            style={{
              width: state === 'in-progress'
                ? `${(entry.answeredQuestions / entry.totalQuestions) * 100}%`
                : `${Math.min(100, Math.max(0, entry.maxScore > 0 ? (entry.score / entry.maxScore) * 100 : 0))}%`,
            }}
          />
        </div>
        <div className="mt-1 whitespace-nowrap text-xs font-semibold text-brand-ink-muted">
          {state === 'in-progress' || state === 'abandoned' ? `${entry.answeredQuestions} of ${entry.totalQuestions} answered` : `${entry.maxScore > 0 ? Math.round((entry.score / entry.maxScore) * 100) : 0}%`}
        </div>
      </td>
      <td className="px-4 py-3.5">
        <ActivityStatusBadge state={state} />
      </td>
    </tr>
  );
}
