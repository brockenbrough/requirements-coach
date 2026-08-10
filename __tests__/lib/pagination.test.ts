import { describe, expect, it } from 'vitest';
import { PAGE_GAP, pageItems } from '../../lib/pagination';

describe('pageItems', () => {
  it('returns every page when the run is short enough to fit', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('elides the middle when the current page sits between both ends', () => {
    expect(pageItems(10, 20)).toEqual([1, PAGE_GAP, 9, 10, 11, PAGE_GAP, 20]);
  });

  it('elides only on the right near the start', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, PAGE_GAP, 20]);
    expect(pageItems(2, 20)).toEqual([1, 2, 3, PAGE_GAP, 20]);
  });

  it('elides only on the left near the end', () => {
    expect(pageItems(20, 20)).toEqual([1, PAGE_GAP, 19, 20]);
    expect(pageItems(19, 20)).toEqual([1, PAGE_GAP, 18, 19, 20]);
  });

  it('does not emit a gap for a single skipped page', () => {
    // 3 is adjacent to both 2 and 4, so there is nothing to elide between them.
    expect(pageItems(3, 8)).toEqual([1, 2, 3, 4, PAGE_GAP, 8]);
  });

  it('never repeats a page number', () => {
    for (let total = 8; total <= 40; total++) {
      for (let current = 1; current <= total; current++) {
        const numbers = pageItems(current, total).filter((item): item is number => item !== PAGE_GAP);
        expect(new Set(numbers).size).toBe(numbers.length);
      }
    }
  });

  it('stays within a fixed width and keeps both ends, at every position', () => {
    for (let total = 8; total <= 40; total++) {
      for (let current = 1; current <= total; current++) {
        const items = pageItems(current, total);

        // Five numbers plus two gaps is the ceiling the window is designed around.
        expect(items.length).toBeLessThanOrEqual(7);
        expect(items[0]).toBe(1);
        expect(items[items.length - 1]).toBe(total);
        expect(items).toContain(current);
      }
    }
  });

  it('keeps page numbers ascending and never puts two gaps together', () => {
    for (let total = 8; total <= 40; total++) {
      for (let current = 1; current <= total; current++) {
        const items = pageItems(current, total);

        items.forEach((item, index) => {
          if (index === 0) return;
          const previous = items[index - 1];
          if (item === PAGE_GAP) {
            expect(previous).not.toBe(PAGE_GAP);
          } else if (previous !== PAGE_GAP) {
            expect(item).toBeGreaterThan(previous);
          }
        });
      }
    }
  });
});
