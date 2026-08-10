'use client';

/**
 * The paginator shared by the Instructor Dashboard's attempt table and the All Students roster
 * (GitHub #82). Both pages previously rendered one button per page, which is fine for a mock of
 * 35 rows and unusable for a real class across several semesters — a windowed control keeps the
 * row a fixed width no matter how many pages there are.
 *
 * Paging stays client-side on purpose. The roster cannot page server-side at all: summarizeStudents
 * (lib/activityLogTypes.ts) needs *every* attempt of a student to compute their average and
 * needsAttention flag, so a server that returned one page of attempts would produce wrong
 * aggregates.
 */

import { PAGE_GAP, pageItems } from '../lib/pagination';

const BUTTON_BASE =
  'min-w-9 rounded-brand-md border px-2.5 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40';
const BUTTON_IDLE =
  'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple disabled:hover:border-gray-300 disabled:hover:text-gray-600';
const BUTTON_ACTIVE = 'border-brand-purple bg-brand-purple text-white';

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  // One page is not a choice — rendering a lone disabled "1" is noise.
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex gap-1.5">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className={`${BUTTON_BASE} ${BUTTON_IDLE}`}
      >
        Prev
      </button>

      {pageItems(currentPage, totalPages).map((item, index) =>
        item === PAGE_GAP ? (
          // Decorative: screen readers announce the current page from aria-current, and a
          // focusable "…" would only add a dead stop on the way to the next real page.
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="flex min-w-9 items-center justify-center text-xs font-bold text-gray-400"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-current={item === currentPage ? 'page' : undefined}
            aria-label={`Page ${item}`}
            className={`${BUTTON_BASE} ${item === currentPage ? BUTTON_ACTIVE : BUTTON_IDLE}`}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className={`${BUTTON_BASE} ${BUTTON_IDLE}`}
      >
        Next
      </button>
    </nav>
  );
}
