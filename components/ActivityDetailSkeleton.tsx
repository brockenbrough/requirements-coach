import { MAX_DIFFICULTY_LEVEL } from '../lib/sessionRules';

/**
 * Shown on app/activities/[slug]/page.tsx while its current-session and completed-attempts
 * fetches are both still in flight — shaped like the real hero card (badges, title,
 * instructions, Start/Resume button, level picker) in the same shimmer-block style as
 * components/AcceptanceCriteriaWritingScreenSkeleton.tsx, so nothing about "the activity" is
 * shown until there's real data to show; CompletedAttemptsTable's own attempts === null skeleton
 * covers the history table underneath once this skeleton gives way to the real card.
 *
 * The level-chip row renders levelSlotCount placeholders, matching
 * components/LevelReplaySelector.tsx's own totalLevels — that component now always renders a
 * fixed number of slots (locking the ones a student hasn't reached yet) rather than growing once
 * attempts loads, so the skeleton underneath it should show the same fixed count instead of a
 * generic two-chip guess.
 */
export function ActivityDetailSkeleton({ levelSlotCount = MAX_DIFFICULTY_LEVEL }: { levelSlotCount?: number }) {
  return (
    <div role="status" aria-label="Loading activity">
      <div className="rounded-2xl border border-[#332b6b] bg-[#1b1642] p-8">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="skeleton-block block h-6 w-24 rounded-full" />
          <span className="skeleton-block block h-6 w-20 rounded-full" />
        </div>
        <span className="skeleton-block mb-3 block h-6 w-2/3 rounded-full" />
        <span className="skeleton-block mb-1.5 block h-4 w-full rounded-full" />
        <span className="skeleton-block mb-6 block h-4 w-4/5 rounded-full" />
        <span className="skeleton-block block h-11 w-32 rounded-full" />
        <div className="mt-6 flex flex-wrap gap-2">
          {Array.from({ length: levelSlotCount }, (_, i) => (
            <span key={i} className="skeleton-block block h-7 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <style jsx>{`
        .skeleton-block {
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.06) 25%, rgba(255, 255, 255, 0.16) 37%, rgba(255, 255, 255, 0.06) 63%);
          background-size: 400% 100%;
          animation: skeleton-shimmer 1.6s ease-in-out infinite;
        }
        @keyframes skeleton-shimmer {
          0% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-block {
            animation: none;
            background: rgba(255, 255, 255, 0.08);
          }
        }
      `}</style>
    </div>
  );
}
