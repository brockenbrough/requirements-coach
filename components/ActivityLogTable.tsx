import { ActivityLogRow } from './ActivityLogRow';
import type { ActivityLogEntry } from '../lib/activityLogTypes';

const COLUMNS = ['Activity', 'Level', 'Date & time', 'Score', 'Result'];

/**
 * getStudentName is how the Instructor Dashboard (GitHub #82) reuses this same table for
 * StudentActivitySummary[] — a plain ActivityLogEntry[] just omits it and gets the original
 * student-less table back.
 *
 * Generic in the row type so that callback sees the caller's row, not the narrowed base type:
 * the instructor dashboard looks a student up by entry.studentId (GitHub #174), which only
 * exists on StudentActivitySummary. Callers that omit getStudentName infer T = ActivityLogEntry
 * and are unaffected (app/dashboard/log/page.tsx).
 */
export function ActivityLogTable<T extends ActivityLogEntry>({
  entries,
  getStudentName,
}: {
  entries: T[];
  getStudentName?: (entry: T) => string;
}) {
  const columns = getStudentName ? ['Student', ...COLUMNS] : COLUMNS;

  return (
    <div className="overflow-x-auto rounded-brand-lg border border-brand-navy-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="bg-brand-navy text-brand-ink-muted">
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="bg-brand-navy-2 px-4 py-10 text-center text-sm font-semibold text-brand-ink-muted">
                No attempts match these filters.
              </td>
            </tr>
          ) : (
            entries.map((entry) => (
              <ActivityLogRow key={entry.id} entry={entry} variant="table" studentName={getStudentName?.(entry)} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
