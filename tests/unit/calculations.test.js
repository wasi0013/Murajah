/**
 * Unit tests for calculations.js
 * Tests all calculation and utility functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the pageHasanah module before importing calculations
vi.mock('../../source/resources/js/utils/pageHasanah.js', () => ({
  PAGE_HASANAH_VALUES: {
    1: 139, 2: 154, 3: 188, 604: 127
  },
  getPageHasanah: (pageNum) => {
    const values = { 1: 139, 2: 154, 3: 188, 604: 127 };
    return values[pageNum] || 150; // Default value
  }
}));

// Now import calculations
const calculationsModule = await import('../../source/resources/js/utils/calculations.js');
const {
  calculateMemorizationPercentage,
  calculateJuzCount,
  getPageFromJuz,
  getJuzFromPage,
  calculateRemainingPages,
  estimateCompletionDate,
  formatDate,
  formatDuration,
  getScoreColor,
  getStatusColor,
  calculateProgress,
  groupBy,
  sortByMistakeCount,
  generateMistakeBubbles,
  generateMemorizedGrid,
  calculatePageScore,
  calculateTotalScore,
  calculateStatistics,
  parsePageNumber,
  isValidPageRange,
  generatePageRange
} = calculationsModule;

describe('calculations.js', () => {

  describe('calculateMemorizationPercentage()', () => {
    it('should return 0% for 0 memorized pages', () => {
      expect(calculateMemorizationPercentage(0, 604)).toBe(0);
    });

    it('should return 100% for all pages memorized', () => {
      expect(calculateMemorizationPercentage(604, 604)).toBe(100);
    });

    it('should calculate correct percentage', () => {
      expect(calculateMemorizationPercentage(302, 604)).toBe(50);
      expect(calculateMemorizationPercentage(60, 604)).toBe(10);
      expect(calculateMemorizationPercentage(1, 604)).toBe(0); // Rounds to 0
    });

    it('should handle custom total', () => {
      expect(calculateMemorizationPercentage(305, 610)).toBe(50);
    });

    it('should return 0 when total is 0', () => {
      expect(calculateMemorizationPercentage(10, 0)).toBe(0);
    });
  });

  describe('calculateJuzCount()', () => {
    it('should return 0 for 0 pages', () => {
      expect(calculateJuzCount(0)).toBe(0);
    });

    it('should return 1 for 1-20 pages', () => {
      expect(calculateJuzCount(1)).toBe(1);
      expect(calculateJuzCount(20)).toBe(1);
    });

    it('should return correct Juz count', () => {
      expect(calculateJuzCount(21)).toBe(2);
      expect(calculateJuzCount(40)).toBe(2);
      expect(calculateJuzCount(604)).toBe(31); // 604/20 = 30.2 → 31
    });
  });

  describe('getPageFromJuz()', () => {
    it('should return first page of Juz 1', () => {
      expect(getPageFromJuz(1, 1)).toBe(1);
    });

    it('should return correct page for Juz and position', () => {
      expect(getPageFromJuz(1, 20)).toBe(20);
      expect(getPageFromJuz(2, 1)).toBe(21);
      expect(getPageFromJuz(30, 1)).toBe(581);
    });

    it('should clamp position to valid range', () => {
      expect(getPageFromJuz(1, 0)).toBe(1); // Min 1
      expect(getPageFromJuz(1, 25)).toBe(20); // Max 20
    });

    it('should default to position 1', () => {
      expect(getPageFromJuz(5)).toBe(81);
    });
  });

  describe('getJuzFromPage()', () => {
    it('should return Juz 1 for pages 1-20', () => {
      expect(getJuzFromPage(1)).toBe(1);
      expect(getJuzFromPage(20)).toBe(1);
    });

    it('should return correct Juz for page', () => {
      expect(getJuzFromPage(21)).toBe(2);
      expect(getJuzFromPage(40)).toBe(2);
      expect(getJuzFromPage(604)).toBe(31);
    });
  });

  describe('calculateRemainingPages()', () => {
    it('should return total when nothing memorized', () => {
      expect(calculateRemainingPages(0, 604)).toBe(604);
    });

    it('should return 0 when all memorized', () => {
      expect(calculateRemainingPages(604, 604)).toBe(0);
    });

    it('should calculate remaining correctly', () => {
      expect(calculateRemainingPages(100, 604)).toBe(504);
    });

    it('should never return negative', () => {
      expect(calculateRemainingPages(700, 604)).toBe(0);
    });
  });

  describe('estimateCompletionDate()', () => {
    it('should return null for 0 pages per day', () => {
      expect(estimateCompletionDate(100, 0)).toBeNull();
    });

    it('should return null for negative pages per day', () => {
      expect(estimateCompletionDate(100, -1)).toBeNull();
    });

    it('should calculate correct completion date', () => {
      const startDate = new Date('2026-01-01');
      const result = estimateCompletionDate(10, 1, startDate);
      expect(result.toISOString().split('T')[0]).toBe('2026-01-11');
    });

    it('should handle fractional pages per day', () => {
      const startDate = new Date('2026-01-01');
      const result = estimateCompletionDate(10, 2, startDate);
      expect(result.toISOString().split('T')[0]).toBe('2026-01-06');
    });
  });

  describe('formatDate()', () => {
    it('should format date correctly', () => {
      const date = new Date('2026-01-15');
      expect(formatDate(date)).toContain('Jan');
      expect(formatDate(date)).toContain('15');
      expect(formatDate(date)).toContain('2026');
    });

    it('should return empty string for null', () => {
      expect(formatDate(null)).toBe('');
    });
  });

  describe('formatDuration()', () => {
    it('should return "0:00" for 0 seconds', () => {
      expect(formatDuration(0)).toBe('0:00');
    });

    it('should return "0:00" for null/undefined', () => {
      expect(formatDuration(null)).toBe('0:00');
      expect(formatDuration(undefined)).toBe('0:00');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(65)).toBe('1:05');
      expect(formatDuration(125)).toBe('2:05');
      expect(formatDuration(59)).toBe('0:59');
    });

    it('should format hours', () => {
      expect(formatDuration(3661)).toBe('1:01:01');
      expect(formatDuration(7325)).toBe('2:02:05');
    });

    it('should handle negative values', () => {
      expect(formatDuration(-10)).toBe('0:00');
    });
  });

  describe('getScoreColor()', () => {
    it('should return gray for 0', () => {
      expect(getScoreColor(0)).toContain('gray');
    });

    it('should return green for high scores', () => {
      expect(getScoreColor(6)).toContain('green-500');
      expect(getScoreColor(5)).toContain('green-400');
    });

    it('should return yellow for medium scores', () => {
      expect(getScoreColor(4)).toContain('yellow-400');
      expect(getScoreColor(3)).toContain('yellow-500');
    });

    it('should return orange for low scores', () => {
      expect(getScoreColor(1)).toContain('orange');
      expect(getScoreColor(2)).toContain('orange');
    });
  });

  describe('getStatusColor()', () => {
    it('should return correct colors for statuses', () => {
      expect(getStatusColor('perfect')).toContain('green');
      expect(getStatusColor('memorized')).toContain('blue');
      expect(getStatusColor('mistake')).toContain('red');
      expect(getStatusColor('revision')).toContain('purple');
    });

    it('should return gray for unknown status', () => {
      expect(getStatusColor('unknown')).toContain('gray');
    });
  });

  describe('calculateProgress()', () => {
    it('should return 0 for 0 total', () => {
      expect(calculateProgress(10, 0)).toBe(0);
    });

    it('should calculate correct percentage', () => {
      expect(calculateProgress(50, 100)).toBe(50);
      expect(calculateProgress(1, 4)).toBe(25);
    });

    it('should cap at 100%', () => {
      expect(calculateProgress(150, 100)).toBe(100);
    });
  });

  describe('groupBy()', () => {
    it('should group items by key', () => {
      const items = [
        { type: 'a', val: 1 },
        { type: 'b', val: 2 },
        { type: 'a', val: 3 }
      ];
      const result = groupBy(items, item => item.type);
      
      expect(result.a).toHaveLength(2);
      expect(result.b).toHaveLength(1);
    });

    it('should handle empty array', () => {
      expect(groupBy([], x => x)).toEqual({});
    });
  });

  describe('sortByMistakeCount()', () => {
    it('should sort by count descending', () => {
      const map = new Map([
        [1, new Set(['a', 'b', 'c'])],
        [2, new Set(['a'])],
        [3, new Set(['a', 'b'])]
      ]);
      
      const result = sortByMistakeCount(map);
      
      expect(result[0].pageNum).toBe(1);
      expect(result[0].count).toBe(3);
      expect(result[1].pageNum).toBe(3);
      expect(result[2].pageNum).toBe(2);
    });

    it('should sort by page number for equal counts', () => {
      const map = new Map([
        [5, new Set(['a'])],
        [2, new Set(['a'])],
        [8, new Set(['a'])]
      ]);
      
      const result = sortByMistakeCount(map);
      
      expect(result[0].pageNum).toBe(2);
      expect(result[1].pageNum).toBe(5);
      expect(result[2].pageNum).toBe(8);
    });
  });

  describe('generateMistakeBubbles()', () => {
    it('should generate 604 bubbles', () => {
      const map = new Map();
      const bubbles = generateMistakeBubbles(map);
      
      expect(bubbles).toHaveLength(604);
    });

    it('should mark pages with correct colors based on count', () => {
      const map = new Map([
        [1, new Set()],
        [2, new Set(['a'])],
        [3, new Set(['a', 'b', 'c'])],
        [4, new Set(['a', 'b', 'c', 'd', 'e'])]
      ]);
      
      const bubbles = generateMistakeBubbles(map);
      
      expect(bubbles[0].color).toContain('gray'); // 0 mistakes
      expect(bubbles[1].color).toContain('yellow'); // 1 mistake
      expect(bubbles[2].color).toContain('orange'); // 3 mistakes
      expect(bubbles[3].color).toContain('red'); // 5 mistakes
    });
  });

  describe('generateMemorizedGrid()', () => {
    it('should generate 604 grid items', () => {
      const set = new Set();
      const grid = generateMemorizedGrid(set);
      
      expect(grid).toHaveLength(604);
    });

    it('should mark memorized pages correctly', () => {
      const set = new Set([1, 100, 604]);
      const grid = generateMemorizedGrid(set);
      
      expect(grid[0].isMemorized).toBe(true);
      expect(grid[99].isMemorized).toBe(true);
      expect(grid[603].isMemorized).toBe(true);
      expect(grid[1].isMemorized).toBe(false);
    });

    it('should calculate correct juzNum and juzPosition', () => {
      const set = new Set();
      const grid = generateMemorizedGrid(set);
      
      expect(grid[0].juzNum).toBe(1);
      expect(grid[0].juzPosition).toBe(1);
      expect(grid[19].juzNum).toBe(1);
      expect(grid[19].juzPosition).toBe(20);
      expect(grid[20].juzNum).toBe(2);
      expect(grid[20].juzPosition).toBe(1);
    });
  });

  describe('calculatePageScore()', () => {
    it('should return 0 for 0 revisions', () => {
      expect(calculatePageScore(1, 0)).toBe(0);
    });

    it('should return 0 for negative revisions', () => {
      expect(calculatePageScore(1, -1)).toBe(0);
    });

    it('should calculate score as hasanah * revisions', () => {
      // Page 1 has hasanah 139
      expect(calculatePageScore(1, 1)).toBe(139);
      expect(calculatePageScore(1, 2)).toBe(278);
    });
  });

  describe('calculateTotalScore()', () => {
    it('should return 0 for empty object', () => {
      expect(calculateTotalScore({})).toBe(0);
    });

    it('should sum all page scores', () => {
      const data = {
        '1': 1, // 139 * 1 = 139
        '2': 2  // 154 * 2 = 308
      };
      expect(calculateTotalScore(data)).toBe(139 + 308);
    });

    it('should ignore invalid page numbers', () => {
      const data = {
        '1': 1,
        '0': 10,    // Invalid
        '700': 10,  // Invalid
        'abc': 10   // Invalid
      };
      expect(calculateTotalScore(data)).toBe(139);
    });
  });

  describe('calculateStatistics()', () => {
    it('should calculate all statistics', () => {
      const stats = calculateStatistics({
        memorized: 100,
        mistakes: 10,
        audios: 5,
        perfectRevisions: 50,
        total: 604
      });

      expect(stats.memorized).toBe(100);
      expect(stats.remaining).toBe(504);
      expect(stats.percentage).toBe(17); // 100/604 ≈ 16.6%
      expect(stats.juzCount).toBe(5);
      expect(stats.mistakes).toBe(10);
      expect(stats.audios).toBe(5);
      expect(stats.averagePerfect).toBe(1); // 50/100 rounded
    });

    it('should handle default values', () => {
      const stats = calculateStatistics({});
      
      expect(stats.memorized).toBe(0);
      expect(stats.remaining).toBe(604);
      expect(stats.percentage).toBe(0);
    });
  });

  describe('parsePageNumber()', () => {
    it('should parse valid page numbers', () => {
      expect(parsePageNumber(1)).toBe(1);
      expect(parsePageNumber('100')).toBe(100);
      expect(parsePageNumber(604)).toBe(604);
    });

    it('should return null for invalid input', () => {
      expect(parsePageNumber(0)).toBeNull();
      expect(parsePageNumber(-1)).toBeNull();
      expect(parsePageNumber(605)).toBeNull();
      expect(parsePageNumber('abc')).toBeNull();
      expect(parsePageNumber(NaN)).toBeNull();
    });

    it('should respect custom max pages', () => {
      expect(parsePageNumber(610, 610)).toBe(610);
      expect(parsePageNumber(611, 610)).toBeNull();
    });
  });

  describe('isValidPageRange()', () => {
    it('should validate correct ranges', () => {
      expect(isValidPageRange(1, 604)).toBe(true);
      expect(isValidPageRange(100, 200)).toBe(true);
      expect(isValidPageRange(1, 1)).toBe(true);
    });

    it('should reject invalid ranges', () => {
      expect(isValidPageRange(0, 100)).toBe(false);
      expect(isValidPageRange(1, 700)).toBe(false);
      expect(isValidPageRange(200, 100)).toBe(false);
    });
  });

  describe('generatePageRange()', () => {
    it('should generate correct range', () => {
      expect(generatePageRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
      expect(generatePageRange(10, 10)).toEqual([10]);
    });

    it('should return empty array for invalid range', () => {
      expect(generatePageRange(5, 1)).toEqual([]);
      expect(generatePageRange(0, 10)).toEqual([]);
    });
  });
});
