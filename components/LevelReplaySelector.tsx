'use client';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
};

/**
 * Lets a student choose a difficulty level they have already passed for an activity — practice
 * an easier level without being forced back to level 1 or stuck waiting for the next auto-advance
 * level (POST /api/sessions's difficultyLevel override). Modeled on
 * components/LeaderboardCourseSwitcher.tsx's controlled button row (role="group", aria-pressed,
 * parent-owned selection), not components/TitleProgressionTrack.tsx's display-only ladder, which
 * has no click handler — this is an input control, not a status display.
 *
 * Fully controlled: this component holds no state of its own and never starts anything itself —
 * onSelect only records the choice in the parent (app/activities/[slug]/page.tsx), which shows it
 * in the level badge above and only actually starts a session once Start is clicked. disabled
 * locks the row while that Start request is in flight.
 *
 * Lives inside that page's dark hero card (bg-brand-navy), so — unlike the light-surface switcher
 * it's modeled on — its colors are brand-ink/brand-ink-muted/white-alpha rather than the gray
 * scale, matching the card's existing badges (bg-white/10) and Start button (bg-brand-purple).
 */
export function LevelReplaySelector({
  highestPassedLevel,
  selectedLevel,
  onSelect,
  disabled = false,
}: {
  highestPassedLevel: number;
  selectedLevel: number | null;
  onSelect: (level: number) => void;
  disabled?: boolean;
}) {
  // Nothing passed yet is nothing to replay.
  if (highestPassedLevel < 1) return null;

  const levels = Array.from({ length: highestPassedLevel }, (_, i) => i + 1);

  return (
    <div className="mt-6 text-left">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-ink-muted">
        Practice a level you&apos;ve already passed
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Replay a passed level">
        {levels.map((level) => {
          const isSelected = level === selectedLevel;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onSelect(level)}
              aria-pressed={isSelected}
              disabled={disabled}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple disabled:cursor-not-allowed disabled:opacity-40 ${
                isSelected
                  ? 'border-brand-purple bg-brand-purple text-white'
                  : 'border-white/10 bg-white/10 text-brand-ink-muted hover:border-white/20 hover:text-brand-ink'
              }`}
            >
              {DIFFICULTY_LABEL[level] ?? `Level ${level}`} · {level}
            </button>
          );
        })}
      </div>
    </div>
  );
}
