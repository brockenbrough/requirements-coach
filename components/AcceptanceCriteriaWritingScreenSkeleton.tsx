/**
 * GitHub #149: shown while the writing prompt loads, in the same shimmer-block style as
 * ActivityCardSkeleton (GitHub #108) — shaped like the writing screen it stands in for.
 *
 * GitHub #262: two blocks now, matching the writing screen's split into StoryDisplayCard
 * (title + description) and the input form, so there's no layout jump once the real content
 * (and its own card boundary) replaces the skeleton.
 */
export function AcceptanceCriteriaWritingScreenSkeleton() {
  return (
    <div role="status" aria-label="Loading writing question">
      <div className="mb-5 rounded-brand-lg border border-brand-navy-border bg-brand-navy p-6">
        <span className="skeleton-block mb-2 block h-3 w-16 rounded-full" />
        <span className="skeleton-block mb-4 block h-4 w-1/2 rounded-full" />
        <span className="skeleton-block mb-1.5 block h-3 w-24 rounded-full" />
        <span className="skeleton-block mb-1.5 block h-4 w-full rounded-full" />
        <span className="skeleton-block block h-4 w-2/3 rounded-full" />
      </div>
      <div className="rounded-brand-lg border border-brand-navy-border bg-brand-navy p-6">
        <span className="skeleton-block mb-1.5 block h-3 w-40 rounded-full" />
        <span className="skeleton-block block h-32 w-full rounded-brand-md" />
        <span className="skeleton-block mt-5 block h-12 w-full rounded-brand-md" />
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
