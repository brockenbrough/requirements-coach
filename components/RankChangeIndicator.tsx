import type { LeaderboardEntry } from '../lib/leaderboardTypes';

function ArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === 'up' ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
    </svg>
  );
}

/**
 * How many ranks a student moved since they last looked at this leaderboard.
 *
 * Four states, not three: null is "no previous ranking on record" (first visit, or the store was
 * cleared on logout) and is deliberately rendered the same as "unchanged" rather than as a fake
 * zero — the difference is in the tooltip and the screen-reader text, since a grey dash is the
 * honest visual for both "you didn't move" and "we don't know yet".
 *
 * The arrow itself is aria-hidden; the sr-only text is what a screen reader announces, because
 * "▲ 3" on its own says nothing about direction out loud.
 */
export function RankChangeIndicator({ change }: { change: LeaderboardEntry['rankChange'] }) {
  if (change === null || change === 0) {
    const label = change === null ? 'No previous ranking yet' : 'Unchanged';
    return (
      <span className="inline-flex items-center text-brand-ink-muted" title={label}>
        <span aria-hidden="true" className="text-sm font-extrabold">
          –
        </span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  const movedUp = change > 0;
  const places = Math.abs(change);

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-extrabold tabular-nums ${
        movedUp ? 'text-brand-green' : 'text-brand-danger'
      }`}
    >
      <ArrowIcon direction={movedUp ? 'up' : 'down'} />
      <span aria-hidden="true">{places}</span>
      <span className="sr-only">
        {movedUp ? 'Up' : 'Down'} {places} {places === 1 ? 'rank' : 'ranks'}
      </span>
    </span>
  );
}
