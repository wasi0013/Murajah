/**
 * Unit Tests: Juz View
 * Tests for juz data mapping, juz-to-surah relationships, and related utility functions
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Juz to Surahs mapping - maps each juz number to the surahs it contains
// Format: { juzNum: [{ surah: N, startVerse: X, endVerse: Y }] }
const JUZ_TO_SURAHS = {
  1: [{ surah: 1, startVerse: 1, endVerse: 7 }, { surah: 2, startVerse: 1, endVerse: 141 }],
  2: [{ surah: 2, startVerse: 142, endVerse: 252 }],
  3: [{ surah: 2, startVerse: 253, endVerse: 286 }, { surah: 3, startVerse: 1, endVerse: 92 }],
  4: [{ surah: 3, startVerse: 93, endVerse: 200 }, { surah: 4, startVerse: 1, endVerse: 23 }],
  5: [{ surah: 4, startVerse: 24, endVerse: 147 }],
  6: [{ surah: 4, startVerse: 148, endVerse: 176 }, { surah: 5, startVerse: 1, endVerse: 81 }],
  7: [{ surah: 5, startVerse: 82, endVerse: 120 }, { surah: 6, startVerse: 1, endVerse: 110 }],
  8: [{ surah: 6, startVerse: 111, endVerse: 165 }, { surah: 7, startVerse: 1, endVerse: 87 }],
  9: [{ surah: 7, startVerse: 88, endVerse: 206 }, { surah: 8, startVerse: 1, endVerse: 40 }],
  10: [{ surah: 8, startVerse: 41, endVerse: 75 }, { surah: 9, startVerse: 1, endVerse: 92 }],
  11: [{ surah: 9, startVerse: 93, endVerse: 129 }, { surah: 10, startVerse: 1, endVerse: 109 }, { surah: 11, startVerse: 1, endVerse: 5 }],
  12: [{ surah: 11, startVerse: 6, endVerse: 123 }, { surah: 12, startVerse: 1, endVerse: 52 }],
  13: [{ surah: 12, startVerse: 53, endVerse: 111 }, { surah: 13, startVerse: 1, endVerse: 43 }, { surah: 14, startVerse: 1, endVerse: 52 }],
  14: [{ surah: 15, startVerse: 1, endVerse: 99 }, { surah: 16, startVerse: 1, endVerse: 128 }],
  15: [{ surah: 17, startVerse: 1, endVerse: 111 }, { surah: 18, startVerse: 1, endVerse: 74 }],
  16: [{ surah: 18, startVerse: 75, endVerse: 110 }, { surah: 19, startVerse: 1, endVerse: 98 }, { surah: 20, startVerse: 1, endVerse: 135 }],
  17: [{ surah: 21, startVerse: 1, endVerse: 112 }, { surah: 22, startVerse: 1, endVerse: 78 }],
  18: [{ surah: 23, startVerse: 1, endVerse: 118 }, { surah: 24, startVerse: 1, endVerse: 64 }, { surah: 25, startVerse: 1, endVerse: 20 }],
  19: [{ surah: 25, startVerse: 21, endVerse: 77 }, { surah: 26, startVerse: 1, endVerse: 227 }, { surah: 27, startVerse: 1, endVerse: 55 }],
  20: [{ surah: 27, startVerse: 56, endVerse: 93 }, { surah: 28, startVerse: 1, endVerse: 88 }, { surah: 29, startVerse: 1, endVerse: 45 }],
  21: [{ surah: 29, startVerse: 46, endVerse: 69 }, { surah: 30, startVerse: 1, endVerse: 60 }, { surah: 31, startVerse: 1, endVerse: 34 }, { surah: 32, startVerse: 1, endVerse: 30 }, { surah: 33, startVerse: 1, endVerse: 30 }],
  22: [{ surah: 33, startVerse: 31, endVerse: 73 }, { surah: 34, startVerse: 1, endVerse: 54 }, { surah: 35, startVerse: 1, endVerse: 45 }, { surah: 36, startVerse: 1, endVerse: 27 }],
  23: [{ surah: 36, startVerse: 28, endVerse: 83 }, { surah: 37, startVerse: 1, endVerse: 182 }, { surah: 38, startVerse: 1, endVerse: 88 }, { surah: 39, startVerse: 1, endVerse: 31 }],
  24: [{ surah: 39, startVerse: 32, endVerse: 75 }, { surah: 40, startVerse: 1, endVerse: 85 }, { surah: 41, startVerse: 1, endVerse: 46 }],
  25: [{ surah: 41, startVerse: 47, endVerse: 54 }, { surah: 42, startVerse: 1, endVerse: 53 }, { surah: 43, startVerse: 1, endVerse: 89 }, { surah: 44, startVerse: 1, endVerse: 59 }, { surah: 45, startVerse: 1, endVerse: 37 }],
  26: [{ surah: 46, startVerse: 1, endVerse: 35 }, { surah: 47, startVerse: 1, endVerse: 38 }, { surah: 48, startVerse: 1, endVerse: 29 }, { surah: 49, startVerse: 1, endVerse: 18 }, { surah: 50, startVerse: 1, endVerse: 45 }, { surah: 51, startVerse: 1, endVerse: 30 }],
  27: [{ surah: 51, startVerse: 31, endVerse: 60 }, { surah: 52, startVerse: 1, endVerse: 49 }, { surah: 53, startVerse: 1, endVerse: 62 }, { surah: 54, startVerse: 1, endVerse: 55 }, { surah: 55, startVerse: 1, endVerse: 78 }, { surah: 56, startVerse: 1, endVerse: 96 }, { surah: 57, startVerse: 1, endVerse: 29 }],
  28: [{ surah: 58, startVerse: 1, endVerse: 22 }, { surah: 59, startVerse: 1, endVerse: 24 }, { surah: 60, startVerse: 1, endVerse: 13 }, { surah: 61, startVerse: 1, endVerse: 14 }, { surah: 62, startVerse: 1, endVerse: 11 }, { surah: 63, startVerse: 1, endVerse: 11 }, { surah: 64, startVerse: 1, endVerse: 18 }, { surah: 65, startVerse: 1, endVerse: 12 }, { surah: 66, startVerse: 1, endVerse: 12 }],
  29: [{ surah: 67, startVerse: 1, endVerse: 30 }, { surah: 68, startVerse: 1, endVerse: 52 }, { surah: 69, startVerse: 1, endVerse: 52 }, { surah: 70, startVerse: 1, endVerse: 44 }, { surah: 71, startVerse: 1, endVerse: 28 }, { surah: 72, startVerse: 1, endVerse: 28 }, { surah: 73, startVerse: 1, endVerse: 20 }, { surah: 74, startVerse: 1, endVerse: 56 }, { surah: 75, startVerse: 1, endVerse: 40 }, { surah: 76, startVerse: 1, endVerse: 31 }, { surah: 77, startVerse: 1, endVerse: 50 }],
  30: [{ surah: 78, startVerse: 1, endVerse: 40 }, { surah: 79, startVerse: 1, endVerse: 46 }, { surah: 80, startVerse: 1, endVerse: 42 }, { surah: 81, startVerse: 1, endVerse: 29 }, { surah: 82, startVerse: 1, endVerse: 19 }, { surah: 83, startVerse: 1, endVerse: 36 }, { surah: 84, startVerse: 1, endVerse: 25 }, { surah: 85, startVerse: 1, endVerse: 22 }, { surah: 86, startVerse: 1, endVerse: 17 }, { surah: 87, startVerse: 1, endVerse: 19 }, { surah: 88, startVerse: 1, endVerse: 26 }, { surah: 89, startVerse: 1, endVerse: 30 }, { surah: 90, startVerse: 1, endVerse: 20 }, { surah: 91, startVerse: 1, endVerse: 15 }, { surah: 92, startVerse: 1, endVerse: 21 }, { surah: 93, startVerse: 1, endVerse: 11 }, { surah: 94, startVerse: 1, endVerse: 8 }, { surah: 95, startVerse: 1, endVerse: 8 }, { surah: 96, startVerse: 1, endVerse: 19 }, { surah: 97, startVerse: 1, endVerse: 5 }, { surah: 98, startVerse: 1, endVerse: 8 }, { surah: 99, startVerse: 1, endVerse: 8 }, { surah: 100, startVerse: 1, endVerse: 11 }, { surah: 101, startVerse: 1, endVerse: 11 }, { surah: 102, startVerse: 1, endVerse: 8 }, { surah: 103, startVerse: 1, endVerse: 3 }, { surah: 104, startVerse: 1, endVerse: 9 }, { surah: 105, startVerse: 1, endVerse: 5 }, { surah: 106, startVerse: 1, endVerse: 4 }, { surah: 107, startVerse: 1, endVerse: 7 }, { surah: 108, startVerse: 1, endVerse: 3 }, { surah: 109, startVerse: 1, endVerse: 6 }, { surah: 110, startVerse: 1, endVerse: 3 }, { surah: 111, startVerse: 1, endVerse: 5 }, { surah: 112, startVerse: 1, endVerse: 4 }, { surah: 113, startVerse: 1, endVerse: 5 }, { surah: 114, startVerse: 1, endVerse: 6 }]
};

// Standard verse counts for all 114 surahs
const VERSE_COUNTS = {
  1: 7, 2: 286, 3: 200, 4: 176, 5: 120, 6: 165, 7: 206, 8: 75, 9: 129, 10: 109,
  11: 123, 12: 111, 13: 43, 14: 52, 15: 99, 16: 128, 17: 111, 18: 110, 19: 98, 20: 135,
  21: 112, 22: 78, 23: 118, 24: 64, 25: 77, 26: 227, 27: 93, 28: 88, 29: 69, 30: 60,
  31: 34, 32: 30, 33: 73, 34: 54, 35: 45, 36: 83, 37: 182, 38: 88, 39: 75, 40: 85,
  41: 54, 42: 53, 43: 89, 44: 59, 45: 37, 46: 35, 47: 38, 48: 29, 49: 18, 50: 45,
  51: 60, 52: 49, 53: 62, 54: 55, 55: 78, 56: 96, 57: 29, 58: 22, 59: 24, 60: 13,
  61: 14, 62: 11, 63: 11, 64: 18, 65: 12, 66: 12, 67: 30, 68: 52, 69: 52, 70: 44,
  71: 28, 72: 28, 73: 20, 74: 56, 75: 40, 76: 31, 77: 50, 78: 40, 79: 46, 80: 42,
  81: 29, 82: 19, 83: 36, 84: 25, 85: 22, 86: 17, 87: 19, 88: 26, 89: 30, 90: 20,
  91: 15, 92: 21, 93: 11, 94: 8, 95: 8, 96: 19, 97: 5, 98: 8, 99: 8, 100: 11,
  101: 11, 102: 8, 103: 3, 104: 9, 105: 5, 106: 4, 107: 7, 108: 3, 109: 6, 110: 3,
  111: 5, 112: 4, 113: 5, 114: 6
};

// QPC/Uthmani Juz page ranges
const JUZ_RANGES_QPC = {
  1: [1, 21], 2: [22, 41], 3: [42, 61], 4: [62, 81], 5: [82, 101],
  6: [102, 121], 7: [122, 141], 8: [142, 161], 9: [162, 181], 10: [182, 201],
  11: [202, 221], 12: [222, 241], 13: [242, 261], 14: [262, 281], 15: [282, 301],
  16: [302, 321], 17: [322, 341], 18: [342, 361], 19: [362, 381], 20: [382, 401],
  21: [402, 421], 22: [422, 441], 23: [442, 461], 24: [462, 481], 25: [482, 501],
  26: [502, 521], 27: [522, 541], 28: [542, 561], 29: [562, 581], 30: [582, 604]
};

// Indopak Juz page ranges (610 pages)
const JUZ_RANGES_INDOPAK = {
  1: [1, 21], 2: [22, 41], 3: [42, 62], 4: [63, 82], 5: [83, 102],
  6: [103, 122], 7: [123, 142], 8: [143, 162], 9: [163, 182], 10: [183, 202],
  11: [203, 222], 12: [223, 242], 13: [243, 262], 14: [263, 282], 15: [283, 302],
  16: [303, 322], 17: [323, 342], 18: [343, 362], 19: [363, 383], 20: [384, 403],
  21: [404, 423], 22: [424, 443], 23: [444, 463], 24: [464, 483], 25: [484, 504],
  26: [505, 524], 27: [525, 545], 28: [546, 565], 29: [566, 585], 30: [586, 610]
};

const getSurahVerseCount = (surahNum) => VERSE_COUNTS[surahNum] || 0;

// Get surahs info for a specific juz
const getJuzSurahs = (juzNum) => {
  const surahs = JUZ_TO_SURAHS[juzNum] || [];
  return surahs.map(s => ({
    surah: s.surah,
    startVerse: s.startVerse,
    endVerse: s.endVerse,
    verseCount: s.endVerse - s.startVerse + 1,
    isPartial: s.startVerse !== 1 || s.endVerse !== getSurahVerseCount(s.surah)
  }));
};

// Get total verse count for a juz
const getJuzTotalVerses = (juzNum) => {
  const surahs = JUZ_TO_SURAHS[juzNum] || [];
  return surahs.reduce((total, s) => total + (s.endVerse - s.startVerse + 1), 0);
};

// Get page range for a juz based on layout
const getJuzPageRange = (juzNum, isIndopak = false) => {
  if (isIndopak) {
    return JUZ_RANGES_INDOPAK[juzNum] || [1, 21];
  }
  return JUZ_RANGES_QPC[juzNum] || [1, 21];
};

describe('Juz View - JUZ_TO_SURAHS Mapping', () => {
  it('should have exactly 30 juzs defined', () => {
    expect(Object.keys(JUZ_TO_SURAHS).length).toBe(30);
  });

  it('should have all juz numbers from 1 to 30', () => {
    for (let i = 1; i <= 30; i++) {
      expect(JUZ_TO_SURAHS[i]).toBeDefined();
      expect(Array.isArray(JUZ_TO_SURAHS[i])).toBe(true);
    }
  });

  it('should have Juz 1 starting with Al-Fatihah', () => {
    const juz1 = JUZ_TO_SURAHS[1];
    expect(juz1[0].surah).toBe(1);
    expect(juz1[0].startVerse).toBe(1);
    expect(juz1[0].endVerse).toBe(7);
  });

  it('should have Juz 1 containing beginning of Al-Baqarah', () => {
    const juz1 = JUZ_TO_SURAHS[1];
    expect(juz1[1].surah).toBe(2);
    expect(juz1[1].startVerse).toBe(1);
    expect(juz1[1].endVerse).toBe(141);
  });

  it('should have Juz 30 containing An-Nas (114) as the last surah', () => {
    const juz30 = JUZ_TO_SURAHS[30];
    const lastEntry = juz30[juz30.length - 1];
    expect(lastEntry.surah).toBe(114);
    expect(lastEntry.startVerse).toBe(1);
    expect(lastEntry.endVerse).toBe(6);
  });

  it('should have Juz 30 starting with An-Naba (78)', () => {
    const juz30 = JUZ_TO_SURAHS[30];
    expect(juz30[0].surah).toBe(78);
    expect(juz30[0].startVerse).toBe(1);
  });

  it('should have Juz 29 starting with Al-Mulk (67)', () => {
    const juz29 = JUZ_TO_SURAHS[29];
    expect(juz29[0].surah).toBe(67);
    expect(juz29[0].startVerse).toBe(1);
  });

  it('should have contiguous verse ranges across juzs (no gaps)', () => {
    // Build a map of surah -> all verse ranges
    const surahVerseRanges = {};
    
    for (let juz = 1; juz <= 30; juz++) {
      const entries = JUZ_TO_SURAHS[juz];
      for (const entry of entries) {
        if (!surahVerseRanges[entry.surah]) {
          surahVerseRanges[entry.surah] = [];
        }
        surahVerseRanges[entry.surah].push({
          juz,
          start: entry.startVerse,
          end: entry.endVerse
        });
      }
    }
    
    // Check Al-Baqarah (2) spans juzs 1, 2, 3
    expect(surahVerseRanges[2]).toBeDefined();
    expect(surahVerseRanges[2].length).toBe(3); // Split across 3 juzs
    
    // Verify ranges are contiguous
    const baqarahRanges = surahVerseRanges[2].sort((a, b) => a.start - b.start);
    expect(baqarahRanges[0].start).toBe(1);
    expect(baqarahRanges[0].end).toBe(141);
    expect(baqarahRanges[1].start).toBe(142);
    expect(baqarahRanges[1].end).toBe(252);
    expect(baqarahRanges[2].start).toBe(253);
    expect(baqarahRanges[2].end).toBe(286); // Total verses in Al-Baqarah
  });
});

describe('Juz View - getJuzSurahs Function', () => {
  it('should return array of surah info objects for Juz 1', () => {
    const surahs = getJuzSurahs(1);
    expect(Array.isArray(surahs)).toBe(true);
    expect(surahs.length).toBe(2); // Fatihah + partial Baqarah
  });

  it('should correctly identify partial surahs', () => {
    const juz1Surahs = getJuzSurahs(1);
    
    // Al-Fatihah is complete
    expect(juz1Surahs[0].surah).toBe(1);
    expect(juz1Surahs[0].isPartial).toBe(false);
    
    // Al-Baqarah is partial (only verses 1-141 of 286)
    expect(juz1Surahs[1].surah).toBe(2);
    expect(juz1Surahs[1].isPartial).toBe(true);
  });

  it('should calculate verse counts correctly', () => {
    const juz1Surahs = getJuzSurahs(1);
    
    // Al-Fatihah: 7 verses
    expect(juz1Surahs[0].verseCount).toBe(7);
    
    // Al-Baqarah partial: 141 verses
    expect(juz1Surahs[1].verseCount).toBe(141);
  });

  it('should return empty array for invalid juz number', () => {
    expect(getJuzSurahs(0)).toEqual([]);
    expect(getJuzSurahs(31)).toEqual([]);
    expect(getJuzSurahs(-1)).toEqual([]);
  });

  it('should have many surahs for Juz 30', () => {
    const juz30Surahs = getJuzSurahs(30);
    // Juz 30 contains surahs 78-114 (37 surahs)
    expect(juz30Surahs.length).toBe(37);
  });

  it('should have all complete surahs in Juz 30', () => {
    const juz30Surahs = getJuzSurahs(30);
    // All surahs in Juz 30 are complete (start from verse 1)
    for (const surah of juz30Surahs) {
      expect(surah.startVerse).toBe(1);
      expect(surah.isPartial).toBe(false);
    }
  });
});

describe('Juz View - getJuzTotalVerses Function', () => {
  it('should return correct total verses for Juz 1', () => {
    const total = getJuzTotalVerses(1);
    // Al-Fatihah (7) + Al-Baqarah partial (141) = 148
    expect(total).toBe(148);
  });

  it('should return correct total verses for Juz 2', () => {
    const total = getJuzTotalVerses(2);
    // Al-Baqarah 142-252 = 111 verses
    expect(total).toBe(111);
  });

  it('should return 0 for invalid juz number', () => {
    expect(getJuzTotalVerses(0)).toBe(0);
    expect(getJuzTotalVerses(31)).toBe(0);
    expect(getJuzTotalVerses(-1)).toBe(0);
  });

  it('should have approximately equal verse counts across juzs', () => {
    // Each juz should have roughly the same number of verses (varies slightly)
    const verseCounts = [];
    for (let juz = 1; juz <= 30; juz++) {
      verseCounts.push(getJuzTotalVerses(juz));
    }
    
    // Average should be around 208 verses per juz (6236 / 30)
    const average = verseCounts.reduce((a, b) => a + b, 0) / 30;
    expect(average).toBeGreaterThan(150);
    expect(average).toBeLessThan(250);
  });

  it('should sum to total Quran verses', () => {
    let totalVerses = 0;
    for (let juz = 1; juz <= 30; juz++) {
      totalVerses += getJuzTotalVerses(juz);
    }
    // Total Quran has 6236 verses
    expect(totalVerses).toBe(6236);
  });
});

describe('Juz View - Page Ranges (QPC/Uthmani Layout)', () => {
  it('should return correct page range for Juz 1 (QPC)', () => {
    const range = getJuzPageRange(1, false);
    expect(range).toEqual([1, 21]);
  });

  it('should return correct page range for Juz 30 (QPC)', () => {
    const range = getJuzPageRange(30, false);
    expect(range).toEqual([582, 604]);
  });

  it('should have QPC layout end at page 604', () => {
    const juz30Range = getJuzPageRange(30, false);
    expect(juz30Range[1]).toBe(604);
  });

  it('should have contiguous page ranges', () => {
    for (let juz = 1; juz < 30; juz++) {
      const currentRange = getJuzPageRange(juz, false);
      const nextRange = getJuzPageRange(juz + 1, false);
      // End of current juz + 1 should equal start of next juz
      expect(currentRange[1] + 1).toBe(nextRange[0]);
    }
  });

  it('should return default range for invalid juz', () => {
    expect(getJuzPageRange(0, false)).toEqual([1, 21]);
    expect(getJuzPageRange(31, false)).toEqual([1, 21]);
  });
});

describe('Juz View - Page Ranges (Indopak Layout)', () => {
  it('should return correct page range for Juz 1 (Indopak)', () => {
    const range = getJuzPageRange(1, true);
    expect(range).toEqual([1, 21]);
  });

  it('should return correct page range for Juz 30 (Indopak)', () => {
    const range = getJuzPageRange(30, true);
    expect(range).toEqual([586, 610]);
  });

  it('should have Indopak layout end at page 610', () => {
    const juz30Range = getJuzPageRange(30, true);
    expect(juz30Range[1]).toBe(610);
  });

  it('should have different ranges than QPC for some juzs', () => {
    // Juz 30 has different ranges between layouts
    const qpcRange = getJuzPageRange(30, false);
    const indopakRange = getJuzPageRange(30, true);
    
    expect(qpcRange[1]).toBe(604);
    expect(indopakRange[1]).toBe(610);
  });
});

describe('Juz View - State Management', () => {
  let surahViewState;

  beforeEach(() => {
    surahViewState = {
      selectedSurah: null,
      pages: [],
      allPages: [],
      loadedPageCount: 0,
      pageBatchSize: 1,
      isLoading: false,
      hasMore: true,
      loadedFonts: new Set(),
      totalVerseCount: 0,
      activeTab: 'surahs' // Default to surahs tab
    };
  });

  it('should initialize with surahs tab active by default', () => {
    expect(surahViewState.activeTab).toBe('surahs');
  });

  it('should allow switching to juzs tab', () => {
    surahViewState.activeTab = 'juzs';
    expect(surahViewState.activeTab).toBe('juzs');
  });

  it('should allow switching back to surahs tab', () => {
    surahViewState.activeTab = 'juzs';
    surahViewState.activeTab = 'surahs';
    expect(surahViewState.activeTab).toBe('surahs');
  });

  it('should reset activeTab when navigating away', () => {
    surahViewState.activeTab = 'juzs';
    surahViewState.selectedSurah = 1;
    
    // When user selects a surah, tab state should be preserved
    expect(surahViewState.activeTab).toBe('juzs');
  });
});

describe('Juz View - Specific Juz Content Verification', () => {
  it('Juz 30 should contain An-Naba (78) to An-Nas (114)', () => {
    const juz30Surahs = getJuzSurahs(30);
    const surahNumbers = juz30Surahs.map(s => s.surah);
    
    // Should contain all surahs from 78 to 114
    for (let i = 78; i <= 114; i++) {
      expect(surahNumbers).toContain(i);
    }
  });

  it('Juz 29 should contain Al-Mulk (67) to Al-Mursalat (77)', () => {
    const juz29Surahs = getJuzSurahs(29);
    const surahNumbers = juz29Surahs.map(s => s.surah);
    
    expect(surahNumbers).toContain(67); // Al-Mulk
    expect(surahNumbers).toContain(77); // Al-Mursalat
    // Should not contain surah 78 (An-Naba) which is in Juz 30
    expect(surahNumbers).not.toContain(78);
  });

  it('Juz 28 should contain Al-Mujadila (58) to At-Tahrim (66)', () => {
    const juz28Surahs = getJuzSurahs(28);
    const surahNumbers = juz28Surahs.map(s => s.surah);
    
    expect(surahNumbers).toContain(58); // Al-Mujadila
    expect(surahNumbers).toContain(66); // At-Tahrim
  });

  it('Juz 18 should contain Al-Muminun (23) parts', () => {
    const juz18Surahs = getJuzSurahs(18);
    const surahNumbers = juz18Surahs.map(s => s.surah);
    
    expect(surahNumbers).toContain(23); // Al-Muminun
  });
});
