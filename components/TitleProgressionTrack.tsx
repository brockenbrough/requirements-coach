import type { TitleLadderRung } from '../lib/leaderboardTypes';

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * GitHub #39: the full title ladder for one activity type (e.g. Story Apprentice → Story
 * Analyst → Story Master), so a student can see what they're working toward next — not just
 * their current title in isolation. currentLevel alone (from GET /api/students/{id}/titles,
 * already reconciled with every known activity type by lib/masteryTitles.ts) is enough to
 * derive every tier's state: passed, current, next-to-unlock, or still locked.
 *
 * Locked/unlocked cards with a lock icon, per the issue's own reference to the pre-existing
 * (mock) design — reached tiers get a filled check badge instead once real progress exists.
 */
export function TitleProgressionTrack({
  progression,
  currentLevel,
}: {
  progression: TitleLadderRung[];
  currentLevel: number | null;
}) {
  return (
    <div className="mt-3 space-y-2">
      {progression.map((rung) => {
        const { difficultyLevel: level, title } = rung;
        const reached = currentLevel !== null && level <= currentLevel;
        const isCurrent = level === currentLevel;
        const isNext = currentLevel === null ? level === 1 : level === currentLevel + 1;

        return (
          <div
            key={level}
            className={`flex items-center gap-2.5 rounded-brand-md border px-3 py-2 transition-colors ${
              isCurrent
                ? 'border-brand-purple bg-brand-purple/10'
                : reached
                  ? 'border-brand-teal/40 bg-brand-teal/10'
                  : 'border-gray-200 bg-white'
            }`}
          >
            <span
              className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${
                reached ? 'bg-brand-teal text-white' : 'bg-gray-200 text-gray-400'
              }`}
            >
              {reached ? <CheckIcon /> : <LockIcon />}
            </span>
            {/* An activity whose title_definition rows don't exist yet (any freshly created quiz)
                has no name for this rung. Showing the level alone is the whole row then — the
                previous version substituted a "Level N" *title* and still rendered the level
                sub-label underneath, so every such ladder read "Level 1 / Level 1 / Level 2 / …". */}
            <div className="min-w-0 flex-1">
              {title === null ? (
                <p className={`truncate text-sm font-extrabold ${reached ? 'text-brand-navy' : 'text-gray-400'}`}>
                  Level {level}
                </p>
              ) : (
                <>
                  <p className={`truncate text-sm font-extrabold ${reached ? 'text-brand-navy' : 'text-gray-400'}`}>{title}</p>
                  <p className="text-xs font-semibold text-gray-400">Level {level}</p>
                </>
              )}
            </div>
            {isCurrent ? (
              <span className="flex-none whitespace-nowrap rounded-full bg-brand-purple px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                Current
              </span>
            ) : isNext ? (
              <span className="flex-none whitespace-nowrap rounded-full bg-brand-gold/25 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-gold-dark">
                Next
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
