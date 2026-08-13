const ROW_COUNT = 10; // matches PAGE_SIZE in app/leaderboard/page.tsx

/**
 * Loading placeholder for the leaderboard table, mirroring its real row height and column widths
 * so the page doesn't jump when the data lands — same job as MasteryProgressSkeleton and
 * ActivityCardSkeleton do for their sections.
 *
 * Light-on-dark shimmer, unlike those two: this skeleton stands in for a table on brand-navy-2,
 * not for tiles on the white <main>, so the dark-on-light gradient they use would be invisible.
 */
export function LeaderboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading leaderboard"
      className="overflow-hidden rounded-brand-lg border border-brand-navy-border"
    >
      <div className="flex items-center gap-4 bg-brand-navy px-4 py-3">
        <span className="skeleton-block h-3 w-10 rounded-full" />
        <span className="skeleton-block h-3 w-9 rounded-full" />
        <span className="skeleton-block h-3 w-20 rounded-full" />
        <span className="skeleton-block ml-auto h-3 w-14 rounded-full" />
        <span className="skeleton-block h-3 w-14 rounded-full" />
      </div>

      {Array.from({ length: ROW_COUNT }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-4 border-t border-brand-navy-border bg-brand-navy-2 px-4 py-3.5"
        >
          <span className="skeleton-block h-8 w-8 flex-none rounded-full" />
          <span className="skeleton-block h-9 w-9 flex-none rounded-full" />
          <span className="skeleton-block h-3.5 w-28 rounded-full" />
          <span className="skeleton-block ml-auto h-3.5 w-12 rounded-full" />
          <span className="skeleton-block h-3.5 w-8 rounded-full" />
        </div>
      ))}

      <style jsx>{`
        .skeleton-block {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.06) 25%,
            rgba(255, 255, 255, 0.14) 37%,
            rgba(255, 255, 255, 0.06) 63%
          );
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
            background: rgba(255, 255, 255, 0.09);
          }
        }
      `}</style>
    </div>
  );
}
