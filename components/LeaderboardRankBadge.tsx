// CLAUDE.md reserves brand-gold for "rewards/XP/achievements", which is exactly the podium.
// Silver has no token, so second place borrows the muted ink; third takes teal rather than an
// invented bronze — a one-off hex here would be the first break in the token rule.
const RANK_CLASSES: Record<number, string> = {
  1: 'bg-brand-gold/25 text-brand-gold',
  2: 'bg-brand-ink-muted/25 text-brand-ink',
  3: 'bg-brand-teal/20 text-brand-teal',
};

const RANK_DEFAULT = 'text-brand-ink-muted';

/**
 * A student's position, as the pill both leaderboard views render.
 *
 * Its own component rather than a constant shared between LeaderboardTable and
 * LeaderboardPreview: the podium colouring is the one piece of the row those two views can't
 * inherit from a shared row component (the table's row is a <tr>, the preview's is a flex div),
 * so it is also the one piece most likely to drift if each kept its own copy.
 */
export function LeaderboardRankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={`inline-flex h-8 min-w-8 flex-none items-center justify-center rounded-full px-2 text-xs font-extrabold tabular-nums ${
        RANK_CLASSES[rank] ?? RANK_DEFAULT
      }`}
    >
      {rank}
    </span>
  );
}
