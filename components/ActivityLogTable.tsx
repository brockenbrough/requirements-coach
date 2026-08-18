import { ActivityLogRow } from './ActivityLogRow';
import type { ActivityLogEntry } from '../lib/activityLogTypes';

const COLUMNS = ['Activity', 'Level', 'Date & time', 'Score', 'Result'];

/**
 * getStudentName is how the Instructor Dashboard (GitHub #82) reuses this same table for
 * StudentActivitySummary[] — a plain ActivityLogEntry[] just omits it and gets the original
 * student-less table back. renderDetail (GitHub #276) is the same opt-in shape for the expand
 * chevron column: omitted by the student's own log, supplied by the combined Instructor
 * Dashboard to render a quiz attempt's or AC submission's detail panel per row. getCourses
 * (GitHub #474) follows the identical opt-in shape for a Course column — a student viewing their
 * own log already knows which course they're in, so only the instructor dashboard supplies it.
 *
 * Generic in the row type so all three callbacks see the caller's row, not the narrowed base type:
 * the instructor dashboard looks a student up by entry.studentId (GitHub #174) and branches
 * renderDetail on entry.kind (GitHub #276), neither of which exists on plain ActivityLogEntry.
 * Callers that omit all three infer T = ActivityLogEntry and are unaffected (app/dashboard/log/page.tsx).
 */
export function ActivityLogTable<T extends ActivityLogEntry>({
  entries,
  getStudentName,
  getCourses,
  renderDetail,
}: {
  entries: T[];
  getStudentName?: (entry: T) => string;
  getCourses?: (entry: T) => { courseId: string; courseName: string }[];
  renderDetail?: (entry: T) => React.ReactNode;
}) {
  const columns = [
    ...(getStudentName ? ['Student'] : []),
    ...COLUMNS,
    ...(getCourses ? ['Course'] : []),
    ...(renderDetail ? [''] : []),
  ];

  return (
    <div className="overflow-x-auto rounded-brand-lg border border-brand-navy-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="bg-brand-navy text-brand-ink-muted">
            {columns.map((column, index) => (
              <th key={column || `col-${index}`} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide">
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
              <ActivityLogRow
                key={entry.id}
                entry={entry}
                variant="table"
                studentName={getStudentName?.(entry)}
                courses={getCourses?.(entry)}
                renderDetail={renderDetail}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
