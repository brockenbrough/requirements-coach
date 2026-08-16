'use client';

import { MAX_DIFFICULTY_LEVEL } from '../lib/sessionRules';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
};

// Same glyph as components/TitleProgressionTrack.tsx's LockIcon — kept as its own local copy
// rather than a shared export, matching this codebase's convention of small per-component icon
// functions (see e.g. components/StoryDisplayCard.tsx's CopyIcon/CheckIcon).
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * Lets a student choose which difficulty level to start next — any level they've already
 * passed, to practice an easier one, or the level they'd auto-advance to anyway (POST
 * /api/sessions's difficultyLevel override accepts both, up to and including that auto-advance
 * level — see that route's comment). Modeled on components/LeaderboardCourseSwitcher.tsx's
 * controlled button row (role="group", aria-pressed, parent-owned selection), not
 * components/TitleProgressionTrack.tsx's display-only ladder, which has no click handler — this
 * is an input control, not a status display.
 *
 * Always renders totalLevels slots (default MAX_DIFFICULTY_LEVEL), not just the unlocked ones —
 * anything above highestSelectableLevel renders locked (disabled, lock icon, no click handler)
 * rather than being omitted. This is deliberate: the row's *shape* no longer depends on when
 * attempts has loaded, only which of its buttons are enabled does — so there is nothing left to
 * visibly pop in once real data replaces app/activities/[slug]/page.tsx's initial guess, and
 * components/ActivityDetailSkeleton.tsx can render the exact same number of placeholder chips
 * up front. write-acceptance-criteria/page.tsx uses the default totalLevels too, even though its
 * highestSelectableLevel is permanently fixed at 1 (that activity has no difficulty progression)
 * — Medium/Hard render locked there forever rather than being hidden, for visual consistency
 * across every activity detail page rather than a special case for that one.
 *
 * Fully controlled: this component holds no state of its own and never starts anything itself —
 * onSelect only records the choice in the parent, which shows it in the level badge above and
 * only actually starts a session once Start is clicked. disabled locks every unlocked button in
 * the row while that Start request is in flight; a locked button is always disabled regardless.
 *
 * Lives inside that page's dark hero card (bg-brand-navy), so — unlike the light-surface switcher
 * it's modeled on — its colors are brand-ink/brand-ink-muted/white-alpha rather than the gray
 * scale, matching the card's existing badges (bg-white/10) and Start button (bg-brand-purple).
 */
export function LevelReplaySelector({
  highestSelectableLevel,
  selectedLevel,
  onSelect,
  disabled = false,
  totalLevels = MAX_DIFFICULTY_LEVEL,
}: {
  /** Every level up to and including this one renders unlocked — see app/activities/[slug]/page.tsx for how it's derived. */
  highestSelectableLevel: number;
  selectedLevel: number | null;
  onSelect: (level: number) => void;
  disabled?: boolean;
  /** How many level slots to render, locked beyond highestSelectableLevel. Defaults to every real difficulty level. */
  totalLevels?: number;
}) {
  const levels = Array.from({ length: totalLevels }, (_, i) => i + 1);

  return (
    <div className="mt-6 text-left">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-ink-muted">
        Choose a difficulty level
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a difficulty level">
        {levels.map((level) => {
          const isSelected = level === selectedLevel;
          const isLocked = level > highestSelectableLevel;
          const label = `${DIFFICULTY_LABEL[level] ?? `Level ${level}`} · ${level}`;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onSelect(level)}
              aria-pressed={isLocked ? undefined : isSelected}
              aria-label={isLocked ? `${label} (locked)` : undefined}
              disabled={disabled || isLocked}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple disabled:cursor-not-allowed ${
                isLocked
                  ? 'border-white/5 bg-white/5 text-brand-ink-muted opacity-50'
                  : isSelected
                    ? 'border-brand-purple bg-brand-purple text-white'
                    : 'border-white/10 bg-white/10 text-brand-ink-muted hover:border-white/20 hover:text-brand-ink disabled:opacity-40'
              }`}
            >
              {isLocked ? <LockIcon /> : null}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
