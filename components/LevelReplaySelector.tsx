'use client';

import { MAX_DIFFICULTY_LEVEL } from '../lib/sessionRules';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
};

/**
 * Lets a student choose which difficulty level to start next — any level they've already
 * passed, to practice an easier one, or the level they'd auto-advance to anyway (POST
 * /api/sessions's difficultyLevel override accepts both, up to and including that auto-advance
 * level — see that route's comment). Modeled on components/LeaderboardCourseSwitcher.tsx's
 * controlled button row (role="group", aria-pressed, parent-owned selection), not
 * components/TitleProgressionTrack.tsx's display-only ladder, which has no click handler — this
 * is an input control, not a status display.
 *
 * Fully controlled: this component holds no state of its own and never starts anything itself —
 * onSelect only records the choice in the parent (app/activities/[slug]/page.tsx), which shows it
 * in the level badge above and only actually starts a session once Start is clicked. disabled
 * locks the row while that Start request is in flight. The unlock animation keeps that contract
 * too: unlockingLevel is a prop, and the timer that clears it lives in the parent.
 *
 * GitHub #371: every level the activity has is rendered, not just the reachable ones — levels
 * past highestSelectableLevel are disabled and carry a padlock. That is a prerequisite for the
 * animation, not just decoration: a lock can only be shown opening if it was on screen closed
 * first. POST /api/sessions would 403 a level the student hasn't reached ('You have not passed
 * that difficulty level yet.'), so disabled is the honest state, and the row now doubles as the
 * progression path.
 *
 * Lives inside that page's dark hero card (bg-brand-navy), so — unlike the light-surface switcher
 * it's modeled on — its colors are brand-ink/brand-ink-muted/white-alpha rather than the gray
 * scale, matching the card's existing badges (bg-white/10) and Start button (bg-brand-purple).
 */
export function LevelReplaySelector({
  highestSelectableLevel,
  totalLevels = MAX_DIFFICULTY_LEVEL,
  selectedLevel,
  onSelect,
  disabled = false,
  unlockingLevel = null,
}: {
  /** The top of the *selectable* range — see app/activities/[slug]/page.tsx for how it's derived. */
  highestSelectableLevel: number;
  /**
   * How many levels this activity has at all, selectable or not — the length of the rendered row.
   * Defaults to the app-wide maximum; app/activities/write-acceptance-criteria/page.tsx passes 1,
   * since that activity has no difficulty progression and must not sprout locks for levels that
   * will never exist there.
   */
  totalLevels?: number;
  selectedLevel: number | null;
  onSelect: (level: number) => void;
  disabled?: boolean;
  /**
   * The level whose padlock should be shown springing open, or null for the usual static row.
   * Set for roughly the animation's duration and then cleared by the parent — see
   * UNLOCK_ANIMATION_MS in app/activities/[slug]/page.tsx.
   */
  unlockingLevel?: number | null;
}) {
  // Defensive only: app/activities/[slug]/page.tsx always derives highestSelectableLevel as at
  // least 1 (a student with nothing passed yet still has level 1 to show), so this never actually
  // hides the row — kept as a guard against a 0/negative value reaching here some other way.
  if (highestSelectableLevel < 1) return null;

  // max() rather than totalLevels alone so a highestSelectableLevel beyond the declared range can
  // never render a selectable level as missing — the row grows instead of silently truncating.
  const levels = Array.from({ length: Math.max(totalLevels, highestSelectableLevel) }, (_, i) => i + 1);

  return (
    <div className="mt-6 text-left">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-ink-muted">
        Choose a difficulty level
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a difficulty level">
        {levels.map((level) => {
          const isLocked = level > highestSelectableLevel;
          const isSelected = !isLocked && level === selectedLevel;
          const isUnlocking = level === unlockingLevel;
          const label = `${DIFFICULTY_LABEL[level] ?? `Level ${level}`} · ${level}`;

          return (
            <button
              key={level}
              type="button"
              onClick={() => onSelect(level)}
              // A permanently unselectable toggle reporting aria-pressed="false" reads as "you
              // chose not to pick this"; locked levels aren't a choice at all, so they get a
              // spelled-out label instead and no pressed state.
              aria-pressed={isLocked ? undefined : isSelected}
              aria-label={
                isLocked
                  ? `${DIFFICULTY_LABEL[level] ?? `Level ${level}`}, level ${level} — locked. Pass level ${level - 1} to unlock.`
                  : undefined
              }
              disabled={disabled || isLocked}
              className={`relative inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-extrabold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple disabled:cursor-not-allowed ${
                isUnlocking ? 'level-unlocking' : ''
              } ${
                isLocked
                  ? 'border-white/5 bg-white/5 text-brand-ink-muted/50'
                  : isSelected
                    ? 'border-brand-purple bg-brand-purple text-white disabled:opacity-40'
                    : 'border-white/10 bg-white/10 text-brand-ink-muted hover:border-white/20 hover:text-brand-ink disabled:opacity-40'
              }`}
            >
              {/* Same padlock as components/TitleProgressionTrack.tsx, inlined rather than shared:
                  styled-jsx scopes its generated class to this component's own JSX, so the shackle
                  inside a child component would never receive the animation below — the same
                  constraint components/InstructorDashboardSkeleton.tsx documents for its shimmer. */}
              {isLocked || isUnlocking ? (
                <svg
                  viewBox="0 0 24 24"
                  className="lock-icon h-3.5 w-3.5 flex-none"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path className="lock-shackle" d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              ) : null}
              {label}
              {isUnlocking ? (
                <>
                  <span className="unlock-spark unlock-spark-1" aria-hidden="true" />
                  <span className="unlock-spark unlock-spark-2" aria-hidden="true" />
                  <span className="unlock-spark unlock-spark-3" aria-hidden="true" />
                  <span className="unlock-spark unlock-spark-4" aria-hidden="true" />
                  <span className="unlock-spark unlock-spark-5" aria-hidden="true" />
                  <span className="unlock-spark unlock-spark-6" aria-hidden="true" />
                  <span className="unlock-spark unlock-spark-7" aria-hidden="true" />
                  <span className="unlock-spark unlock-spark-8" aria-hidden="true" />
                </>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Announced for screen readers, which get nothing from the visual burst. Deliberately
          outside the reduced-motion switch below: someone who turned animations off still needs
          to be told the level opened up. */}
      <p role="status" aria-live="polite" className="sr-only">
        {unlockingLevel !== null
          ? `${DIFFICULTY_LABEL[unlockingLevel] ?? `Level ${unlockingLevel}`}, level ${unlockingLevel} unlocked!`
          : ''}
      </p>

      <style jsx>{`
        /* Rattle and reveal are one keyframe list, not two animations: both drive transform, and
           a second animation with a fill mode would win the cascade over the first for the whole
           run — the shake would silently never render. Percentages of the 1.2s total: rattling to
           25%, shackle swinging out 25-46%, pop and colour reveal 46-60%, glow ring fading to
           100%. The pill starts looking exactly like its locked neighbours (grayscale + dimmed)
           and ends on whatever its real classes say, which is what lets one keyframe set serve
           both the selected (purple) and the plain landing style. */
        .level-unlocking {
          animation: unlock-pill 1.2s ease-out;
        }
        @keyframes unlock-pill {
          0% {
            filter: grayscale(1) brightness(0.6);
            transform: translateX(0) scale(1);
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
          }
          5% {
            transform: translateX(-2px) scale(1);
          }
          10% {
            transform: translateX(2px) scale(1);
          }
          15% {
            transform: translateX(-2px) scale(1);
          }
          20% {
            transform: translateX(2px) scale(1);
          }
          25% {
            filter: grayscale(1) brightness(0.6);
            transform: translateX(0) scale(1);
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
          }
          46% {
            filter: grayscale(0.8) brightness(0.7);
            transform: translateX(0) scale(1.02);
            box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.5);
          }
          60% {
            filter: none;
            transform: translateX(0) scale(1.18);
            box-shadow: 0 0 0 6px rgba(139, 92, 246, 0.35);
          }
          100% {
            filter: none;
            transform: translateX(0) scale(1);
            box-shadow: 0 0 0 14px rgba(139, 92, 246, 0);
          }
        }

        /* Icon side: the shackle swings out of the body first, then the whole padlock leaves.
           forwards keeps it hidden for the rest of the animation — the button unmounts it
           entirely once the parent clears unlockingLevel. */
        .level-unlocking .lock-icon {
          animation: unlock-icon-exit 0.35s ease-in 0.55s forwards;
        }
        .level-unlocking .lock-shackle {
          transform-box: fill-box;
          transform-origin: 100% 100%;
          animation: unlock-shackle 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
        }
        @keyframes unlock-shackle {
          0% {
            transform: translateY(0) rotate(0deg);
          }
          100% {
            transform: translateY(-3px) rotate(-28deg);
          }
        }
        @keyframes unlock-icon-exit {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(0.4) translateY(-4px);
          }
        }

        /* Particle burst, same mechanics as components/PasswordField.tsx: fixed per-spark
           --dx/--dy in CSS rather than inline styles, so no per-instance style prop is needed.
           Timed to the 0.72s pop above (60% of 1.2s) — earlier and they'd be caught by the pill's
           own grayscale filter, which applies to descendants until that point. */
        .unlock-spark {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 4px;
          height: 4px;
          border-radius: 9999px;
          background: var(--rc-gold);
          opacity: 0;
          pointer-events: none;
          animation: unlock-spark-burst 0.6s ease-out 0.72s;
        }
        .unlock-spark-1 {
          --dx: -26px;
          --dy: -16px;
        }
        .unlock-spark-2 {
          --dx: 26px;
          --dy: -15px;
          background: var(--rc-purple-glow);
        }
        .unlock-spark-3 {
          --dx: -34px;
          --dy: 8px;
          animation-delay: 0.79s;
        }
        .unlock-spark-4 {
          --dx: 34px;
          --dy: 10px;
          animation-delay: 0.79s;
          background: var(--rc-purple-glow);
        }
        .unlock-spark-5 {
          --dx: -12px;
          --dy: -24px;
          animation-delay: 0.77s;
        }
        .unlock-spark-6 {
          --dx: 12px;
          --dy: -25px;
          animation-delay: 0.83s;
        }
        .unlock-spark-7 {
          --dx: -8px;
          --dy: 22px;
          animation-delay: 0.85s;
          background: var(--rc-purple-glow);
        }
        .unlock-spark-8 {
          --dx: 10px;
          --dy: 23px;
          animation-delay: 0.75s;
        }
        @keyframes unlock-spark-burst {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.3);
          }
          30% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .level-unlocking,
          .level-unlocking .lock-icon,
          .level-unlocking .lock-shackle {
            animation: none;
          }
          /* No animation means unlock-icon-exit never hides the padlock, and the button would sit
             there unlocked-but-padlocked until the parent's timer unmounts it. Hide it outright. */
          .level-unlocking .lock-icon {
            display: none;
          }
          .unlock-spark {
            animation: none;
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
