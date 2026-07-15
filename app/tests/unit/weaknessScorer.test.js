/**
 * Unit tests for weaknessScorer.js
 * Tests the composite weakness scoring algorithm.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Logger module
vi.mock('../../src/core/memorization/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    MODULES: { PLAN: 'PLAN' },
  },
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    MODULES: { PLAN: 'PLAN' },
  },
}));

const {
  calculatePageWeakness,
  calculateAllWeaknesses,
  getWeakestPages,
  WEIGHTS,
  RECENCY_CAP_DAYS,
  LOW_REVIEW_THRESHOLD,
  AVG_WORDS_PER_PAGE,
} = await import('../../src/core/memorization/weaknessScorer.js');

describe('weaknessScorer.js', () => {
  describe('calculatePageWeakness()', () => {
    it('should return 0 for a perfectly reviewed page with no mistakes', () => {
      const score = calculatePageWeakness({
        daysSinceLastReview: 0,
        perfectRevisionCount: 10,
        totalReviewCount: 10,
        mistakeCount: 0,
        totalWordsOnPage: 128,
        quizAccuracy: 1.0,
      });
      // recency=0, revisionQuality=0, mistakes=0, quiz=0, lowReview=0
      expect(score).toBe(0);
    });

    it('should return high score for never-reviewed page with many mistakes', () => {
      const score = calculatePageWeakness({
        daysSinceLastReview: 30,
        perfectRevisionCount: 0,
        totalReviewCount: 0,
        mistakeCount: 128,
        totalWordsOnPage: 128,
        quizAccuracy: 0,
      });
      // All factors maxed out
      expect(score).toBeGreaterThanOrEqual(90);
    });

    it('should return 100 when all factors are at maximum', () => {
      const score = calculatePageWeakness({
        daysSinceLastReview: 60, // Beyond cap, still capped at 1.0
        perfectRevisionCount: 0,
        totalReviewCount: 0,
        mistakeCount: 200,
        totalWordsOnPage: 128,
        quizAccuracy: 0,
      });
      expect(score).toBe(100);
    });

    it('should handle defaults (no parameters)', () => {
      const score = calculatePageWeakness();
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should weight recency highest', () => {
      // Recently reviewed, no other issues
      const recentScore = calculatePageWeakness({
        daysSinceLastReview: 1,
        perfectRevisionCount: 5,
        totalReviewCount: 5,
        mistakeCount: 0,
        quizAccuracy: 0.9,
      });

      // Not recently reviewed, no other issues
      const staleScore = calculatePageWeakness({
        daysSinceLastReview: 30,
        perfectRevisionCount: 5,
        totalReviewCount: 5,
        mistakeCount: 0,
        quizAccuracy: 0.9,
      });

      expect(staleScore).toBeGreaterThan(recentScore);
      expect(staleScore - recentScore).toBeGreaterThan(20); // Recency is 30% weight
    });

    it('should cap recency factor at RECENCY_CAP_DAYS', () => {
      const at30 = calculatePageWeakness({ daysSinceLastReview: 30 });
      const at60 = calculatePageWeakness({ daysSinceLastReview: 60 });
      const at90 = calculatePageWeakness({ daysSinceLastReview: 90 });
      expect(at30).toBe(at60);
      expect(at60).toBe(at90);
    });

    it('should use neutral quiz factor (0.5) when no quiz data', () => {
      const withQuiz = calculatePageWeakness({
        daysSinceLastReview: 10,
        perfectRevisionCount: 2,
        totalReviewCount: 5,
        mistakeCount: 0,
        quizAccuracy: 0.5, // Equivalent to "no data" neutral
      });

      const noQuiz = calculatePageWeakness({
        daysSinceLastReview: 10,
        perfectRevisionCount: 2,
        totalReviewCount: 5,
        mistakeCount: 0,
        quizAccuracy: null,
      });

      expect(noQuiz).toBe(withQuiz);
    });

    it('should apply low review count penalty for < 3 reviews', () => {
      const fewReviews = calculatePageWeakness({
        daysSinceLastReview: 5,
        perfectRevisionCount: 1,
        totalReviewCount: 1,
        mistakeCount: 0,
      });

      const manyReviews = calculatePageWeakness({
        daysSinceLastReview: 5,
        perfectRevisionCount: 10,
        totalReviewCount: 10,
        mistakeCount: 0,
      });

      expect(fewReviews).toBeGreaterThan(manyReviews);
    });

    it('should not penalize review count when >= 3 reviews', () => {
      const threeReviews = calculatePageWeakness({
        daysSinceLastReview: 5,
        perfectRevisionCount: 3,
        totalReviewCount: 3,
        mistakeCount: 0,
      });

      const tenReviews = calculatePageWeakness({
        daysSinceLastReview: 5,
        perfectRevisionCount: 10,
        totalReviewCount: 10,
        mistakeCount: 0,
      });

      // Both are >= 3 reviews, so no low-review penalty for either
      expect(threeReviews).toBe(tenReviews);
    });

    it('should clamp negative inputs', () => {
      const score = calculatePageWeakness({
        daysSinceLastReview: -5,
        perfectRevisionCount: -2,
        totalReviewCount: -1,
        mistakeCount: -10,
      });
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should return integer between 0 and 100', () => {
      for (let i = 0; i < 20; i++) {
        const score = calculatePageWeakness({
          daysSinceLastReview: Math.random() * 60,
          perfectRevisionCount: Math.floor(Math.random() * 10),
          totalReviewCount: Math.floor(Math.random() * 20),
          mistakeCount: Math.floor(Math.random() * 50),
          quizAccuracy: Math.random(),
        });
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('should account for mistakes relative to page word count', () => {
      // 10 mistakes on a 128-word page
      const normalPage = calculatePageWeakness({
        daysSinceLastReview: 10,
        perfectRevisionCount: 2,
        totalReviewCount: 5,
        mistakeCount: 10,
        totalWordsOnPage: 128,
      });

      // 10 mistakes on a 20-word page (much worse ratio)
      const shortPage = calculatePageWeakness({
        daysSinceLastReview: 10,
        perfectRevisionCount: 2,
        totalReviewCount: 5,
        mistakeCount: 10,
        totalWordsOnPage: 20,
      });

      expect(shortPage).toBeGreaterThan(normalPage);
    });
  });

  describe('calculateAllWeaknesses()', () => {
    it('should return empty map for empty pages array', () => {
      const result = calculateAllWeaknesses({ pages: [] });
      expect(result.size).toBe(0);
    });

    it('should return empty map for null pages', () => {
      const result = calculateAllWeaknesses({ pages: null });
      expect(result.size).toBe(0);
    });

    it('should calculate scores for all pages', () => {
      const pages = [1, 2, 3, 4, 5];
      const result = calculateAllWeaknesses({
        pages,
        perfectRevisions: new Map([[1, 3], [2, 1]]),
        mistakesMap: new Map([[3, new Set(['w1', 'w2'])]]),
        pageReviewData: {
          1: { lastReviewDate: new Date().toISOString().split('T')[0], reviewCount: 5 },
          2: { lastReviewDate: new Date().toISOString().split('T')[0], reviewCount: 2 },
        },
        today: new Date(),
      });

      expect(result.size).toBe(5);
      for (const score of result.values()) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('should give recently reviewed pages lower scores', () => {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = calculateAllWeaknesses({
        pages: [1, 2],
        pageReviewData: {
          1: { lastReviewDate: today.toISOString().split('T')[0], reviewCount: 5 },
          2: { lastReviewDate: thirtyDaysAgo.toISOString().split('T')[0], reviewCount: 5 },
        },
        perfectRevisions: new Map([[1, 3], [2, 3]]),
        today,
      });

      expect(result.get(1)).toBeLessThan(result.get(2));
    });

    it('should handle Map-style and Object-style data interchangeably', () => {
      const pages = [1, 2];
      const today = new Date();

      const resultWithMaps = calculateAllWeaknesses({
        pages,
        perfectRevisions: new Map([[1, 2]]),
        mistakesMap: new Map([[2, new Set(['w1'])]]),
        pageReviewData: new Map([
          [1, { lastReviewDate: today.toISOString().split('T')[0], reviewCount: 3 }],
        ]),
        today,
      });

      expect(resultWithMaps.size).toBe(2);
    });
  });

  describe('getWeakestPages()', () => {
    it('should return top N weakest pages', () => {
      const weaknessMap = new Map([[1, 80], [2, 40], [3, 90], [4, 60], [5, 20]]);
      const result = getWeakestPages(weaknessMap, 3);
      expect(result).toEqual([3, 1, 4]); // 90, 80, 60
    });

    it('should exclude specified pages', () => {
      const weaknessMap = new Map([[1, 80], [2, 40], [3, 90]]);
      const result = getWeakestPages(weaknessMap, 2, [3]);
      expect(result).toEqual([1, 2]); // 3 excluded
    });

    it('should return empty array for empty map', () => {
      expect(getWeakestPages(new Map(), 5)).toEqual([]);
    });

    it('should return empty array for n <= 0', () => {
      const weaknessMap = new Map([[1, 80]]);
      expect(getWeakestPages(weaknessMap, 0)).toEqual([]);
    });

    it('should return all pages if n > map size', () => {
      const weaknessMap = new Map([[1, 80], [2, 40]]);
      const result = getWeakestPages(weaknessMap, 10);
      expect(result.length).toBe(2);
    });

    it('should handle null inputs gracefully', () => {
      expect(getWeakestPages(null, 5)).toEqual([]);
      expect(getWeakestPages(undefined, 5)).toEqual([]);
    });
  });

  describe('Constants', () => {
    it('should have weights summing to 1.0', () => {
      const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
    });

    it('should have RECENCY_CAP_DAYS = 30', () => {
      expect(RECENCY_CAP_DAYS).toBe(30);
    });

    it('should have LOW_REVIEW_THRESHOLD = 3', () => {
      expect(LOW_REVIEW_THRESHOLD).toBe(3);
    });
  });
});
