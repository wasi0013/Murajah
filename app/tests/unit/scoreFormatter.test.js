/**
 * Unit tests for scoreFormatter.js
 * Tests score formatting and parsing functions
 */

import { describe, it, expect } from 'vitest';
import {
  formatScore,
  formatScoreDetailed,
  getScoreMagnitudeColor,
  getScoreMagnitudeBgColor,
  calculateScoreProgress,
  formatScoreWithLabel,
  parseFormattedScore
} from '../../src/core/memorization/scoreFormatter.js';

describe('scoreFormatter.js', () => {

  describe('formatScore()', () => {
    it('should return "0" for null/undefined/NaN', () => {
      expect(formatScore(null)).toBe('0');
      expect(formatScore(undefined)).toBe('0');
      expect(formatScore(NaN)).toBe('0');
    });

    it('should return number as-is for values under 1000', () => {
      expect(formatScore(0)).toBe('0');
      expect(formatScore(1)).toBe('1');
      expect(formatScore(999)).toBe('999');
    });

    it('should format thousands with K', () => {
      expect(formatScore(1000)).toBe('1K');
      expect(formatScore(1500)).toBe('1.5K');
      expect(formatScore(10000)).toBe('10K');
      expect(formatScore(999999)).toBe('1000K'); // Just under 1M
    });

    it('should format millions with M', () => {
      expect(formatScore(1000000)).toBe('1M');
      expect(formatScore(1500000)).toBe('1.5M');
      expect(formatScore(25000000)).toBe('25M');
    });

    it('should format billions with B', () => {
      expect(formatScore(1000000000)).toBe('1B');
      expect(formatScore(2500000000)).toBe('2.5B');
    });

    it('should format trillions with T', () => {
      expect(formatScore(1000000000000)).toBe('1T');
      expect(formatScore(5500000000000)).toBe('5.5T');
    });

    it('should handle negative numbers', () => {
      expect(formatScore(-1500)).toBe('-1.5K');
      expect(formatScore(-1000000)).toBe('-1M');
    });

    it('should respect decimal places parameter', () => {
      expect(formatScore(1234567, 0)).toBe('1M');
      expect(formatScore(1234567, 2)).toBe('1.23M');
      expect(formatScore(1200000, 1)).toBe('1.2M');
    });

    it('should remove trailing zeros', () => {
      expect(formatScore(2000000)).toBe('2M');
      expect(formatScore(1000)).toBe('1K');
    });
  });

  describe('formatScoreDetailed()', () => {
    it('should return "0" for null/undefined/NaN', () => {
      expect(formatScoreDetailed(null)).toBe('0');
      expect(formatScoreDetailed(undefined)).toBe('0');
    });

    it('should format small numbers with locale separators', () => {
      expect(formatScoreDetailed(100)).toBe('100');
      expect(formatScoreDetailed(999)).toBe('999');
    });

    it('should show formatted and exact for large numbers', () => {
      const result = formatScoreDetailed(1500000);
      expect(result).toContain('1.5M');
      expect(result).toContain('1,500,000');
    });
  });

  describe('getScoreMagnitudeColor()', () => {
    it('should return gray for 0', () => {
      expect(getScoreMagnitudeColor(0)).toContain('gray');
    });

    it('should return gray for small numbers', () => {
      expect(getScoreMagnitudeColor(500)).toContain('gray');
    });

    it('should return blue for thousands', () => {
      expect(getScoreMagnitudeColor(5000)).toContain('blue');
    });

    it('should return green for millions', () => {
      expect(getScoreMagnitudeColor(5000000)).toContain('green');
    });

    it('should return purple for billions', () => {
      expect(getScoreMagnitudeColor(5000000000)).toContain('purple');
    });

    it('should return yellow for trillions', () => {
      expect(getScoreMagnitudeColor(5000000000000)).toContain('yellow');
    });
  });

  describe('getScoreMagnitudeBgColor()', () => {
    it('should return gray background for 0', () => {
      expect(getScoreMagnitudeBgColor(0)).toContain('bg-gray');
    });

    it('should return blue background for thousands', () => {
      expect(getScoreMagnitudeBgColor(5000)).toContain('bg-blue');
    });

    it('should return green background for millions', () => {
      expect(getScoreMagnitudeBgColor(5000000)).toContain('bg-green');
    });
  });

  describe('calculateScoreProgress()', () => {
    it('should return 0 for 0 target', () => {
      expect(calculateScoreProgress(100, 0)).toBe(0);
      expect(calculateScoreProgress(100, null)).toBe(0);
    });

    it('should calculate correct percentage', () => {
      expect(calculateScoreProgress(50, 100)).toBe(50);
      expect(calculateScoreProgress(25, 100)).toBe(25);
      expect(calculateScoreProgress(75, 100)).toBe(75);
    });

    it('should cap at 100%', () => {
      expect(calculateScoreProgress(150, 100)).toBe(100);
    });

    it('should round to nearest integer', () => {
      expect(calculateScoreProgress(33, 100)).toBe(33);
      expect(calculateScoreProgress(66, 100)).toBe(66);
    });
  });

  describe('formatScoreWithLabel()', () => {
    it('should format with default label', () => {
      expect(formatScoreWithLabel(1000000)).toBe('Score: 1M');
    });

    it('should format with custom label', () => {
      expect(formatScoreWithLabel(5000, 'Points')).toBe('Points: 5K');
    });
  });

  describe('parseFormattedScore()', () => {
    it('should return 0 for invalid input', () => {
      expect(parseFormattedScore(null)).toBe(0);
      expect(parseFormattedScore('')).toBe(0);
      expect(parseFormattedScore('abc')).toBe(0);
    });

    it('should parse K suffix', () => {
      expect(parseFormattedScore('1K')).toBe(1000);
      expect(parseFormattedScore('1.5K')).toBe(1500);
      expect(parseFormattedScore('10K')).toBe(10000);
    });

    it('should parse M suffix', () => {
      expect(parseFormattedScore('1M')).toBe(1000000);
      expect(parseFormattedScore('1.5M')).toBe(1500000);
      expect(parseFormattedScore('25M')).toBe(25000000);
    });

    it('should parse B suffix', () => {
      expect(parseFormattedScore('1B')).toBe(1000000000);
      expect(parseFormattedScore('2.5B')).toBe(2500000000);
    });

    it('should parse T suffix', () => {
      expect(parseFormattedScore('1T')).toBe(1000000000000);
    });

    it('should handle lowercase suffixes', () => {
      expect(parseFormattedScore('1k')).toBe(1000);
      expect(parseFormattedScore('1m')).toBe(1000000);
    });

    it('should parse regular numbers without suffix', () => {
      expect(parseFormattedScore('100')).toBe(100);
      expect(parseFormattedScore('999')).toBe(999);
    });

    it('should handle whitespace', () => {
      expect(parseFormattedScore('  1K  ')).toBe(1000);
    });
  });
});
