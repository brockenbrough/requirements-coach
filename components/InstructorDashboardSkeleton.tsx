/**
 * Loading placeholder for the Instructor Dashboard (GitHub #174) — mirrors the real layout
 * (stat tiles, roster grid, filter row, attempts table) so the page doesn't jump when
 * loadInstructorActivities resolves, same idea as ActivityCardSkeleton (GitHub #108) on
 * /activities.
 *
 * Two block variants on purpose: this page renders inside AppShell's white <main>, unlike
 * ActivityCardSkeleton and AcceptanceCriteriaWritingScreenSkeleton, which sit on dark surfaces
 * and shimmer in white. A white shimmer is invisible on gray-50 tiles, so everything above the
 * table uses .skeleton-block (dark-on-light) and only the table — brand-navy header,
 * brand-navy-2 rows, see ActivityLogRow — uses .skeleton-block-dark (light-on-dark).
 *
 * The <style jsx> block is duplicated rather than shared because styled-jsx is scoped per
 * component; AcceptanceCriteriaWritingScreenSkeleton duplicates it for the same reason.
 */

const ROSTER_CARD_COUNT = 6; // matches InstructorRoster's INITIAL_VISIBLE_COUNT
const TABLE_ROW_COUNT = 5;

export function InstructorDashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading class activity">
      {/* InstructorActivityStats: one tile per activity in ACTIVITIES */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1].map((tile) => (
          <div key={tile} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-5">
            <span className="skeleton-block block h-4 w-40 rounded-full" />
            <div className="mt-3 flex gap-8">
              <div>
                <span className="skeleton-block block h-6 w-14 rounded-full" />
                <span className="skeleton-block mt-1.5 block h-3 w-24 rounded-full" />
              </div>
              <div>
                <span className="skeleton-block block h-6 w-14 rounded-full" />
                <span className="skeleton-block mt-1.5 block h-3 w-20 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* "Students" heading + "View all students →" link */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="skeleton-block block h-3 w-20 rounded-full" />
        <span className="skeleton-block block h-3 w-28 rounded-full" />
      </div>

      {/* InstructorRoster */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: ROSTER_CARD_COUNT }, (_, index) => (
          <div key={index} className="rounded-brand-lg border border-gray-100 bg-gray-50 p-4">
            <span className="skeleton-block block h-4 w-32 rounded-full" />
            <span className="skeleton-block mt-2 block h-3 w-40 rounded-full" />
            <span className="skeleton-block mt-1.5 block h-3 w-28 rounded-full" />
          </div>
        ))}
      </div>

      {/* InstructorFilters: student select, level pills, sort select */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="skeleton-block block h-3 w-14 rounded-full" />
            <span className="skeleton-block mt-1 block h-9 w-36 rounded-brand-md" />
          </div>
          <div>
            <span className="skeleton-block block h-3 w-10 rounded-full" />
            <div className="mt-1 flex gap-1.5">
              {[0, 1, 2, 3].map((pill) => (
                <span key={pill} className="skeleton-block block h-7 w-16 rounded-full" />
              ))}
            </div>
          </div>
        </div>
        <div>
          <span className="skeleton-block block h-3 w-10 rounded-full" />
          <span className="skeleton-block mt-1 block h-9 w-40 rounded-brand-md" />
        </div>
      </div>

      {/* ActivityLogTable — the one dark surface on this page */}
      <div className="overflow-hidden rounded-brand-lg border border-brand-navy-border">
        <div className="bg-brand-navy px-4 py-3.5">
          <span className="skeleton-block-dark block h-3 w-28 rounded-full" />
        </div>
        {Array.from({ length: TABLE_ROW_COUNT }, (_, index) => (
          <div key={index} className="flex items-center gap-6 border-t border-brand-navy-border bg-brand-navy-2 px-4 py-4">
            <span className="skeleton-block-dark block h-3.5 w-28 rounded-full" />
            <span className="skeleton-block-dark block h-3.5 w-32 rounded-full" />
            <span className="skeleton-block-dark hidden h-3.5 w-16 rounded-full sm:block" />
            <span className="skeleton-block-dark hidden h-3.5 w-24 rounded-full sm:block" />
            <span className="skeleton-block-dark ml-auto block h-3.5 w-16 rounded-full" />
          </div>
        ))}
      </div>

      <style jsx>{`
        .skeleton-block {
          background: linear-gradient(90deg, rgba(0, 0, 0, 0.06) 25%, rgba(0, 0, 0, 0.12) 37%, rgba(0, 0, 0, 0.06) 63%);
          background-size: 400% 100%;
          animation: skeleton-shimmer 1.6s ease-in-out infinite;
        }
        .skeleton-block-dark {
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
            background: rgba(0, 0, 0, 0.08);
          }
          .skeleton-block-dark {
            animation: none;
            background: rgba(255, 255, 255, 0.08);
          }
        }
      `}</style>
    </div>
  );
}
