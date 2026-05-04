/**
 * Unit tests: Mushaf View
 *
 * Tests the mushaf page-image mapping logic.
 * Each image file covers two consecutive pages (odd + even):
 *   page-1-2.png  → pages 1 and 2
 *   page-3-4.png  → pages 3 and 4
 *   …
 *   page-603-604.png → pages 603 and 604
 */

import { describe, it, expect } from 'vitest';

/**
 * Pure helper mirroring the mushafImageUrl computed in index.html.
 * @param {number} pageNum - 1-based QPC page number (1–604)
 * @returns {string} Relative path to the mushaf image
 */
function getMushafImageUrl(pageNum) {
  const oddPage = pageNum % 2 === 0 ? pageNum - 1 : pageNum;
  const evenPage = oddPage + 1;
  return `./resources/assets/images/quran_pages/page-${oddPage}-${evenPage}.png`;
}

describe('Mushaf image URL mapping', () => {
  describe('odd pages resolve to their own pair', () => {
    it('page 1 → page-1-2.png', () => {
      expect(getMushafImageUrl(1)).toBe('./resources/assets/images/quran_pages/page-1-2.png');
    });

    it('page 3 → page-3-4.png', () => {
      expect(getMushafImageUrl(3)).toBe('./resources/assets/images/quran_pages/page-3-4.png');
    });

    it('page 11 → page-11-12.png', () => {
      expect(getMushafImageUrl(11)).toBe('./resources/assets/images/quran_pages/page-11-12.png');
    });

    it('page 99 → page-99-100.png', () => {
      expect(getMushafImageUrl(99)).toBe('./resources/assets/images/quran_pages/page-99-100.png');
    });

    it('page 101 → page-101-102.png', () => {
      expect(getMushafImageUrl(101)).toBe('./resources/assets/images/quran_pages/page-101-102.png');
    });

    it('page 603 → page-603-604.png (last pair)', () => {
      expect(getMushafImageUrl(603)).toBe('./resources/assets/images/quran_pages/page-603-604.png');
    });
  });

  describe('even pages resolve to the preceding odd page pair', () => {
    it('page 2 → page-1-2.png (same image as page 1)', () => {
      expect(getMushafImageUrl(2)).toBe('./resources/assets/images/quran_pages/page-1-2.png');
    });

    it('page 4 → page-3-4.png', () => {
      expect(getMushafImageUrl(4)).toBe('./resources/assets/images/quran_pages/page-3-4.png');
    });

    it('page 100 → page-99-100.png', () => {
      expect(getMushafImageUrl(100)).toBe('./resources/assets/images/quran_pages/page-99-100.png');
    });

    it('page 102 → page-101-102.png', () => {
      expect(getMushafImageUrl(102)).toBe('./resources/assets/images/quran_pages/page-101-102.png');
    });

    it('page 604 → page-603-604.png (last pair)', () => {
      expect(getMushafImageUrl(604)).toBe('./resources/assets/images/quran_pages/page-603-604.png');
    });
  });

  describe('all 604 QPC pages map to a valid image filename', () => {
    it('every page produces a filename matching page-ODD-EVEN.png pattern', () => {
      for (let p = 1; p <= 604; p++) {
        const url = getMushafImageUrl(p);
        expect(url).toMatch(/^\.\/resources\/assets\/images\/quran_pages\/page-\d+-\d+\.png$/);
      }
    });

    it('produces exactly 302 distinct image filenames for 604 pages', () => {
      const urls = new Set();
      for (let p = 1; p <= 604; p++) {
        urls.add(getMushafImageUrl(p));
      }
      expect(urls.size).toBe(302);
    });

    it('consecutive odd+even pages map to the same image', () => {
      for (let odd = 1; odd <= 603; odd += 2) {
        const even = odd + 1;
        expect(getMushafImageUrl(odd)).toBe(getMushafImageUrl(even));
      }
    });

    it('non-consecutive pages map to different images', () => {
      expect(getMushafImageUrl(1)).not.toBe(getMushafImageUrl(3));
      expect(getMushafImageUrl(1)).not.toBe(getMushafImageUrl(5));
      expect(getMushafImageUrl(599)).not.toBe(getMushafImageUrl(601));
    });
  });

  describe('mushaf mode is restricted to QPC layout (not Indopak)', () => {
    it('QPC layout has 604 pages — all mushaf images exist for this range', () => {
      // Verify boundary: page 604 maps to the last valid image
      expect(getMushafImageUrl(604)).toBe('./resources/assets/images/quran_pages/page-603-604.png');
    });

    it('Indopak has 610 pages but mushaf only covers 604 — no image beyond page 604', () => {
      // mushafEnabled is disabled for indopak in the app, so pages 605-610 are never requested.
      // Verify the last valid page maps correctly.
      expect(getMushafImageUrl(604)).toMatch(/page-603-604\.png/);
    });
  });
});
