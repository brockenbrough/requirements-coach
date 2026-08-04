/**
 * Loading placeholder for ActivityCard (GitHub #108) — mirrors its exact layout (icon badge,
 * title, level/title pill row, status line) so the loading state reads as "the real cards are
 * about to appear here" instead of a generic spinner. A shimmer highlight sweeps across each
 * block via a CSS background-position keyframe — no JS animation loop, so it stays cheap even
 * with several cards on screen at once.
 */
export function ActivityCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#332b6b] bg-[#1b1642] p-5" aria-hidden="true">
      <span className="skeleton-block h-11 w-11 rounded-[10px]" />
      <span className="skeleton-block h-4 w-3/4 rounded-full" />
      <div className="flex items-center gap-2">
        <span className="skeleton-block h-5 w-20 rounded-full" />
        <span className="skeleton-block h-4 w-24 rounded-full" />
      </div>
      <span className="skeleton-block h-4 w-1/2 rounded-full" />

      <style jsx>{`
        .skeleton-block {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.06) 25%,
            rgba(255, 255, 255, 0.16) 37%,
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
            background: rgba(255, 255, 255, 0.08);
          }
        }
      `}</style>
    </div>
  );
}
