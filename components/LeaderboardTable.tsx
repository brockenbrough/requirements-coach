import Link from 'next/link';
import { Avatar } from './Avatar';
import { LeaderboardRankBadge } from './LeaderboardRankBadge';
import { RankChangeIndicator } from './RankChangeIndicator';
import type { LeaderboardEntry } from '../lib/leaderboardTypes';

// The photo column has no header — a label above a 36px circle is noise, and the username
// beside it already names the row.
const COLUMNS = ['Rank', '', 'Username', 'Points', 'Change'];

/**
 * One row. Exported so the "Your position" strip below the table and the dashboard preview can
 * render the identical cells rather than re-implementing them — the two views disagreeing about
 * what a rank or a point total looks like is exactly the drift ActivityLogRow avoids by being
 * shared between the log page and the dashboard.
 */
export function LeaderboardRow({
  entry,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
}) {
  return (
    <tr
      className={`border-t border-brand-navy-border text-brand-ink ${
        isCurrentUser ? 'bg-brand-navy-border' : 'bg-brand-navy-2'
      }`}
    >
      <td className={`py-3.5 pr-2 ${isCurrentUser ? 'border-l-4 border-l-brand-purple pl-3' : 'pl-4'}`}>
        <LeaderboardRankBadge rank={entry.rank} />
      </td>
      <td className="py-3.5 pl-1 pr-2">
        <Avatar avatarUrl={entry.avatarUrl} fallbackName={entry.username} size="sm" />
      </td>
      <td className="px-4 py-3.5">
        <Link
          href={`/students/${encodeURIComponent(entry.studentId)}`}
          className="font-extrabold text-white underline-offset-2 hover:text-brand-purple hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-teal"
        >
          {entry.username}
        </Link>
        {isCurrentUser ? <span className="ml-2 text-xs font-extrabold text-brand-purple">You</span> : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 font-bold tabular-nums">{entry.points.toLocaleString()}</td>
      <td className="px-4 py-3.5">
        <RankChangeIndicator change={entry.rankChange} />
      </td>
    </tr>
  );
}

/**
 * The course leaderboard: rank, photo, username, points, and how far the student moved since
 * they last looked. Same dark-table shell as ActivityLogTable so the two read as one system.
 *
 * currentStudentId is what makes a row "yours" — passing it is what renders the purple accent
 * and the "You" tag. Omitted (e.g. before the profile has loaded) simply means no row is marked.
 */
export function LeaderboardTable({
  entries,
  currentStudentId,
}: {
  entries: LeaderboardEntry[];
  currentStudentId?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-brand-lg border border-brand-navy-border">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="bg-brand-navy text-brand-ink-muted">
            {COLUMNS.map((column, index) => (
              <th
                key={column || `col-${index}`}
                className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wide"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="bg-brand-navy-2 px-4 py-10 text-center text-sm font-semibold text-brand-ink-muted"
              >
                No one in this course has completed an activity yet.
              </td>
            </tr>
          ) : (
            entries.map((entry) => (
              <LeaderboardRow
                key={entry.studentId}
                entry={entry}
                isCurrentUser={entry.studentId === currentStudentId}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The signed-in student's own row, repeated below the table when they are not on the page being
 * viewed. A sticky row inside the table would have to fight the overflow-x-auto wrapper for its
 * positioning context; a separate strip gets the same "I can always see where I stand" without
 * that, and reuses LeaderboardRow so the cells cannot drift.
 */
export function YourPositionStrip({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-brand-lg border border-brand-purple/50">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="bg-brand-navy px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-brand-ink-muted">
          Your position
        </caption>
        <tbody>
          <LeaderboardRow entry={entry} isCurrentUser />
        </tbody>
      </table>
    </div>
  );
}
