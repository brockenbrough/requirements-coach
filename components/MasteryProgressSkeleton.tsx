/**
 * Loading placeholder for the profile page's mastery/progress section (GitHub #39) while
 * GET /api/students/{id}/score and GET /api/students/{id}/titles are in flight — mirrors the
 * real layout (three stat tiles, one card per activity type with a 3-row progression track)
 * the same way InstructorDashboardSkeleton (GitHub #174) and ActivityCardSkeleton (GitHub #108)
 * do for their own pages. Dark-on-light shimmer, since this section sits in AppShell's white
 * <main> on bg-gray-50 tiles, same reasoning InstructorDashboardSkeleton's own comment gives.
 */

const ACTIVITY_CARD_COUNT = 3; // matches ACTIVITIES in lib/activityContent.ts

export function MasteryProgressSkeleton() {
  return (
    <div role="status" aria-label="Loading mastery progress">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((tile) => (
          <div key={tile} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-4 text-center">
            <span className="skeleton-block mx-auto block h-7 w-12 rounded-full" />
            <span className="skeleton-block mx-auto mt-2 block h-3 w-20 rounded-full" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: ACTIVITY_CARD_COUNT }, (_, card) => (
          <div key={card} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
            <span className="skeleton-block block h-4 w-32 rounded-full" />
            <span className="skeleton-block mt-2 block h-3 w-24 rounded-full" />
            <div className="mt-3 space-y-2">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-2.5 rounded-brand-md border border-gray-200 bg-white px-3 py-2">
                  <span className="skeleton-block h-7 w-7 flex-none rounded-full" />
                  <div className="flex-1">
                    <span className="skeleton-block block h-3.5 w-24 rounded-full" />
                    <span className="skeleton-block mt-1 block h-2.5 w-12 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .skeleton-block {
          background: linear-gradient(90deg, rgba(0, 0, 0, 0.06) 25%, rgba(0, 0, 0, 0.12) 37%, rgba(0, 0, 0, 0.06) 63%);
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
            background: rgba(0, 0, 0, 0.08);
          }
        }
      `}</style>
    </div>
  );
}
