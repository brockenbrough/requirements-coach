// Which page numbers a paginator should render, split out from components/Pagination.tsx so it
// can be tested as a pure helper (the same reason requireInstructor takes its Supabase client as
// an argument) — the components themselves stay untested by design.

export const PAGE_GAP = 'gap' as const;

export type PageItem = number | typeof PAGE_GAP;

/** Below this, every page fits without eliding anything. */
const MAX_UNELIDED = 7;

/**
 * The page numbers to render, with PAGE_GAP marking an elided run.
 *
 * Always keeps the first page, the last page and the current page's immediate neighbours — at
 * most five numbers plus two gaps, so the control's width stays fixed no matter how many pages
 * exist. That upper bound is exactly MAX_UNELIDED, which is why anything shorter is returned in
 * full instead: eliding it could not make it narrower.
 */
export function pageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= MAX_UNELIDED) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const shown = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const items: PageItem[] = [];
  shown.forEach((page, index) => {
    // A jump of more than one means at least one page was left out between these two.
    if (index > 0 && page - shown[index - 1] > 1) items.push(PAGE_GAP);
    items.push(page);
  });

  return items;
}
