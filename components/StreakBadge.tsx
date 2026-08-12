function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.176 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1015.68 4.534a7.46 7.46 0 01-2.717-2.248zM15.75 14.25a3.75 3.75 0 11-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 011.925-3.545 3.75 3.75 0 013.255 3.717z"
      />
    </svg>
  );
}

/**
 * A student's current daily streak (REQ-GAM-BL-2, GitHub #307), as both leaderboard views
 * render it — LeaderboardTable/LeaderboardRow and the dashboard's LeaderboardPreview share this
 * rather than each drawing their own flame, the same reason RankChangeIndicator is its own
 * component instead of being redrawn per view.
 *
 * Renders nothing for a streak of 0 (no active streak) rather than a flame with a "0" — the
 * same "omit instead of showing a hollow zero" convention NeedsAttentionCallout and the score
 * pill's '—' placeholder already follow elsewhere in the app.
 *
 * brand-gold, not a new color: CLAUDE.md reserves that token for rewards/XP/achievements, which
 * is exactly what LeaderboardRankBadge already uses it for on the podium.
 */
export function StreakBadge({ streak }: { streak: number }) {
  if (streak <= 0) return null;

  return (
    <span
      className="inline-flex flex-none items-center gap-1 text-xs font-extrabold tabular-nums text-brand-gold"
      title={`${streak}-day streak`}
    >
      <FlameIcon />
      <span aria-hidden="true">{streak}</span>
      <span className="sr-only">
        {streak}-day streak
      </span>
    </span>
  );
}
