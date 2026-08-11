'use client';

/**
 * Prev/page-numbers/Next controls — the exact markup that was already duplicated across
 * app/instructor/page.tsx, app/dashboard/log/page.tsx, and app/instructor/students/page.tsx,
 * pulled out here (GitHub #226) so this page and future ones share one implementation instead
 * of a fourth copy. The "Showing X–Y of Z" summary text stays with each caller, since its
 * wording (attempts/students/submissions) differs per page.
 */
export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="min-w-9 rounded-brand-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
      >
        Prev
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onPageChange(page)}
          className={`min-w-9 rounded-brand-md border px-2.5 py-1.5 text-xs font-bold transition ${
            page === currentPage
              ? 'border-brand-purple bg-brand-purple text-white'
              : 'border-gray-300 bg-white text-gray-600 hover:border-brand-purple hover:text-brand-purple'
          }`}
        >
          {page}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="min-w-9 rounded-brand-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold text-gray-600 transition hover:border-brand-purple hover:text-brand-purple disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
      >
        Next
      </button>
    </div>
  );
}
