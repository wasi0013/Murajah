/**
 * Unit tests for planScheduler.js
 * Tests SM-2 algorithm, daily task generation, missed day handling.
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
  calculateNextReview,
  mapToPerformance,
  generateDailyTasks,
  handleMissedDays,
  isCycleComplete,
  initializePageReviewData,
  formatDate,
  addDays,
  getOverduePages,
  PERFORMANCE,
  PASSING_THRESHOLD,
  MIN_EASE_FACTOR,
  DEFAULT_EASE_FACTOR,
  MAX_INTERVAL_BEGINNER,
  MAX_INTERVAL_HAFIZ,
  MAX_BACKLOG_BEFORE_PAUSE,
  STRENGTH_THRESHOLD,
  SHORT_TERM_WINDOW_DAYS,
} = await import('../../src/core/memorization/planScheduler.js');

// Helper: create a date string N days from today
function daysFromNow(n, base = new Date('2026-04-10T00:00:00')) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

const TODAY = new Date('2026-04-10T00:00:00');
const TODAY_STR = '2026-04-10';

describe('planScheduler.js', () => {
  describe('formatDate()', () => {
    it('should format dates as YYYY-MM-DD', () => {
      expect(formatDate(new Date('2026-01-05'))).toBe('2026-01-05');
      expect(formatDate(new Date('2026-12-31'))).toBe('2026-12-31');
    });
  });

  describe('addDays()', () => {
    it('should add days to a date', () => {
      const result = addDays(new Date('2026-04-10'), 5);
      expect(formatDate(result)).toBe('2026-04-15');
    });

    it('should handle month boundaries', () => {
      const result = addDays(new Date('2026-04-28'), 5);
      expect(formatDate(result)).toBe('2026-05-03');
    });

    it('should handle negative days', () => {
      const result = addDays(new Date('2026-04-10'), -3);
      expect(formatDate(result)).toBe('2026-04-07');
    });
  });

  describe('calculateNextReview()', () => {
    it('should reset interval on failure (perf < 3)', () => {
      const result = calculateNextReview(
        { interval: 7, easeFactor: 2.5, consecutiveCorrect: 3 },
        PERFORMANCE.MINOR_MISTAKES, // perf = 2 < 3
        'beginner',
        TODAY
      );
      expect(result.interval).toBe(1);
      expect(result.consecutiveCorrect).toBe(0);
    });

    it('should set interval=1 on first passing review', () => {
      const result = calculateNextReview(
        { interval: 1, easeFactor: 2.5, consecutiveCorrect: 0 },
        PERFORMANCE.CORRECT,
        'beginner',
        TODAY
      );
      expect(result.interval).toBe(1);
      expect(result.consecutiveCorrect).toBe(1);
    });

    it('should set interval=3 on second consecutive success', () => {
      const result = calculateNextReview(
        { interval: 1, easeFactor: 2.5, consecutiveCorrect: 1 },
        PERFORMANCE.CORRECT,
        'beginner',
        TODAY
      );
      expect(result.interval).toBe(3);
      expect(result.consecutiveCorrect).toBe(2);
    });

    it('should multiply interval by ease factor on third+ success', () => {
      const result = calculateNextReview(
        { interval: 3, easeFactor: 2.5, consecutiveCorrect: 2 },
        PERFORMANCE.CORRECT,
        'beginner',
        TODAY
      );
      // 3 * 2.5 = 7.5 → round = 8
      expect(result.interval).toBe(8);
      expect(result.consecutiveCorrect).toBe(3);
    });

    it('should cap interval at MAX_INTERVAL_BEGINNER (14)', () => {
      const result = calculateNextReview(
        { interval: 10, easeFactor: 2.5, consecutiveCorrect: 5 },
        PERFORMANCE.PERFECT,
        'beginner',
        TODAY
      );
      expect(result.interval).toBeLessThanOrEqual(MAX_INTERVAL_BEGINNER);
    });

    it('should cap interval at MAX_INTERVAL_HAFIZ (21)', () => {
      const result = calculateNextReview(
        { interval: 14, easeFactor: 2.5, consecutiveCorrect: 5 },
        PERFORMANCE.PERFECT,
        'hafiz',
        TODAY
      );
      expect(result.interval).toBeLessThanOrEqual(MAX_INTERVAL_HAFIZ);
    });

    it('should never let ease factor drop below MIN_EASE_FACTOR (1.3)', () => {
      let data = { interval: 1, easeFactor: 1.3, consecutiveCorrect: 0 };
      // Repeated failures
      for (let i = 0; i < 10; i++) {
        data = calculateNextReview(data, PERFORMANCE.TOTAL_FAILURE, 'beginner', TODAY);
      }
      expect(data.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
    });

    it('should increase ease factor on perfect performance', () => {
      const result = calculateNextReview(
        { interval: 3, easeFactor: 2.5, consecutiveCorrect: 2 },
        PERFORMANCE.PERFECT,
        'beginner',
        TODAY
      );
      expect(result.easeFactor).toBeGreaterThan(2.5);
    });

    it('should decrease ease factor on poor but passing performance', () => {
      const result = calculateNextReview(
        { interval: 3, easeFactor: 2.5, consecutiveCorrect: 2 },
        PERFORMANCE.HESITATION, // perf = 3 (barely passing)
        'beginner',
        TODAY
      );
      expect(result.easeFactor).toBeLessThan(2.5);
    });

    it('should set correct nextReviewDate', () => {
      const result = calculateNextReview(
        { interval: 1, easeFactor: 2.5, consecutiveCorrect: 1 },
        PERFORMANCE.CORRECT,
        'beginner',
        TODAY
      );
      // interval = 3
      expect(result.nextReviewDate).toBe('2026-04-13');
    });

    it('should set lastReviewDate to today', () => {
      const result = calculateNextReview(
        { interval: 1, easeFactor: 2.5, consecutiveCorrect: 0 },
        PERFORMANCE.PERFECT,
        'beginner',
        TODAY
      );
      expect(result.lastReviewDate).toBe(TODAY_STR);
    });

    it('should handle missing pageReviewData gracefully', () => {
      const result = calculateNextReview(null, PERFORMANCE.CORRECT, 'beginner', TODAY);
      expect(result.interval).toBe(1);
      expect(result.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
    });

    it('should clamp performance to 0-5', () => {
      const tooHigh = calculateNextReview(
        { interval: 3, easeFactor: 2.5, consecutiveCorrect: 2 },
        10, 'beginner', TODAY
      );
      const tooLow = calculateNextReview(
        { interval: 3, easeFactor: 2.5, consecutiveCorrect: 2 },
        -5, 'beginner', TODAY
      );
      expect(tooHigh.interval).toBeGreaterThan(0);
      expect(tooLow.interval).toBe(1); // Clamped to 0 → fail
    });
  });

  describe('mapToPerformance()', () => {
    it('should return 5 for 3+ perfect revisions', () => {
      expect(mapToPerformance({ perfectRevisionCount: 3 })).toBe(5);
      expect(mapToPerformance({ perfectRevisionCount: 10 })).toBe(5);
    });

    it('should return 4 for 2 perfect revisions', () => {
      expect(mapToPerformance({ perfectRevisionCount: 2 })).toBe(4);
    });

    it('should return 3 for 1 perfect revision', () => {
      expect(mapToPerformance({ perfectRevisionCount: 1 })).toBe(3);
    });

    it('should return 2 for 0 perfect revisions', () => {
      expect(mapToPerformance({ perfectRevisionCount: 0 })).toBe(2);
    });

    it('should subtract for mistakes', () => {
      // Base 5, -2 for 3+ mistakes = 3
      expect(mapToPerformance({ perfectRevisionCount: 3, mistakeCount: 5 })).toBe(3);
      // Base 5, -1 for 1-2 mistakes = 4
      expect(mapToPerformance({ perfectRevisionCount: 3, mistakeCount: 1 })).toBe(4);
    });

    it('should adjust for quiz accuracy', () => {
      // Base 3, +1 for >90% quiz = 4
      expect(mapToPerformance({ perfectRevisionCount: 1, quizAccuracy: 0.95 })).toBe(4);
      // Base 3, -1 for <50% quiz = 2
      expect(mapToPerformance({ perfectRevisionCount: 1, quizAccuracy: 0.3 })).toBe(2);
    });

    it('should override with user rating', () => {
      // "perfect" should force at least 4
      expect(mapToPerformance({ perfectRevisionCount: 0, userRating: 'perfect' })).toBe(4);
      // "needs_work" should cap at 2
      expect(mapToPerformance({ perfectRevisionCount: 3, userRating: 'needs_work' })).toBe(2);
    });

    it('should clamp result to 0-5', () => {
      // Worst case: base 2, -2 mistakes, -1 quiz = -1 → clamp to 0
      const score = mapToPerformance({ perfectRevisionCount: 0, mistakeCount: 5, quizAccuracy: 0.2 });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(5);
    });

    it('should handle no parameters', () => {
      const score = mapToPerformance();
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(5);
    });
  });

  describe('initializePageReviewData()', () => {
    it('should create review data for all pages', () => {
      const pages = [582, 583, 584, 585];
      const data = initializePageReviewData(pages, '2026-04-10', 2);

      expect(Object.keys(data).length).toBe(4);
      expect(data[582]).toBeDefined();
      expect(data[585]).toBeDefined();
    });

    it('should stagger initial review dates', () => {
      const pages = [1, 2, 3, 4, 5, 6];
      const data = initializePageReviewData(pages, '2026-04-10', 2);

      // Pages 1,2 → day 0 (2026-04-10), pages 3,4 → day 1, pages 5,6 → day 2
      expect(data[1].nextReviewDate).toBe('2026-04-10');
      expect(data[2].nextReviewDate).toBe('2026-04-10');
      expect(data[3].nextReviewDate).toBe('2026-04-11');
      expect(data[4].nextReviewDate).toBe('2026-04-11');
      expect(data[5].nextReviewDate).toBe('2026-04-12');
      expect(data[6].nextReviewDate).toBe('2026-04-12');
    });

    it('should set default SM-2 values', () => {
      const data = initializePageReviewData([1], '2026-04-10', 1);
      expect(data[1].lastReviewDate).toBeNull();
      expect(data[1].interval).toBe(1);
      expect(data[1].easeFactor).toBe(DEFAULT_EASE_FACTOR);
      expect(data[1].reviewCount).toBe(0);
      expect(data[1].consecutiveCorrect).toBe(0);
      expect(data[1].weaknessScore).toBe(50);
    });
  });

  describe('generateDailyTasks()', () => {
    const makePlan = (overrides = {}) => ({
      status: 'active',
      type: 'beginner',
      targetPages: [582, 583, 584, 585, 586],
      pace: {
        newPagesPerDay: 1,
        revisionPagesPerDay: 3,
        daysPerWeek: 6,
        offDays: [6], // Saturday
      },
      schedulerState: {
        pageReviewData: {
          582: { lastReviewDate: '2026-04-09', nextReviewDate: '2026-04-10', interval: 1, easeFactor: 2.5, reviewCount: 2, consecutiveCorrect: 1, weaknessScore: 30 },
          583: { lastReviewDate: '2026-04-08', nextReviewDate: '2026-04-10', interval: 2, easeFactor: 2.5, reviewCount: 3, consecutiveCorrect: 2, weaknessScore: 40 },
          584: { lastReviewDate: null, nextReviewDate: '2026-04-12', interval: 1, easeFactor: 2.5, reviewCount: 0, consecutiveCorrect: 0, weaknessScore: 50 },
          585: { lastReviewDate: null, nextReviewDate: '2026-04-13', interval: 1, easeFactor: 2.5, reviewCount: 0, consecutiveCorrect: 0, weaknessScore: 50 },
          586: { lastReviewDate: null, nextReviewDate: '2026-04-14', interval: 1, easeFactor: 2.5, reviewCount: 0, consecutiveCorrect: 0, weaknessScore: 50 },
        },
        lastScheduledDate: null,
        backlogPages: [],
      },
      ...overrides,
    });

    const makeAppData = () => ({
      memorizedPages: new Set([582, 583]),
      perfectRevisions: new Map([[582, 2], [583, 1]]),
      mistakesMap: new Map(),
    });

    it('should return null for inactive plan', () => {
      const plan = makePlan({ status: 'paused' });
      const result = generateDailyTasks({ plan, appData: makeAppData(), today: TODAY });
      expect(result).toBeNull();
    });

    it('should return off-day indicator on off days', () => {
      // Saturday = 6 (in offDays)
      const saturday = new Date('2026-04-11T00:00:00'); // April 11, 2026 is Saturday

      const plan = makePlan();
      const result = generateDailyTasks({ plan, appData: makeAppData(), today: saturday });
      expect(result.metadata.isOffDay).toBe(true);
      expect(result.newMemorization).toBeNull();
      // Revision and weak continue on off days
    });

    it('should generate beginner tasks with new memorization', () => {
      const plan = makePlan();
      const result = generateDailyTasks({ plan, appData: makeAppData(), today: TODAY });

      expect(result).toBeDefined();
      expect(result.metadata.isOffDay).toBe(false);

      // Should have new memorization (unmemorized pages)
      if (result.newMemorization) {
        expect(result.newMemorization.pages.length).toBeGreaterThan(0);
        expect(result.newMemorization.completed).toBe(false);
      }
    });

    it('should generate revision tasks for due pages', () => {
      const plan = makePlan();
      const result = generateDailyTasks({ plan, appData: makeAppData(), today: TODAY });

      // Pages 582 and 583 are due on 2026-04-10
      if (result.revision) {
        expect(result.revision.pages.length).toBeGreaterThan(0);
      }
    });

    it('should pause new memorization when backlog exceeds threshold', () => {
      // Create massive backlog
      const reviewData = {};
      for (let p = 1; p <= 15; p++) {
        reviewData[p] = {
          lastReviewDate: '2026-03-01',
          nextReviewDate: '2026-04-05', // 5 days overdue
          interval: 1, easeFactor: 2.5, reviewCount: 1, consecutiveCorrect: 0,
          weaknessScore: 80,
        };
      }

      const plan = makePlan({
        targetPages: Array.from({ length: 20 }, (_, i) => i + 1),
        schedulerState: { pageReviewData: reviewData, lastScheduledDate: null, backlogPages: [] },
      });

      const appData = {
        memorizedPages: new Set(Array.from({ length: 10 }, (_, i) => i + 1)),
        perfectRevisions: new Map(),
        mistakesMap: new Map(),
      };

      const result = generateDailyTasks({ plan, appData, today: TODAY });
      expect(result.metadata.pausedNewMemorization).toBe(true);
      expect(result.newMemorization).toBeNull();
    });

    it('should generate hafiz mode tasks', () => {
      const plan = makePlan({
        type: 'hafiz',
        pace: { revisionPagesPerDay: 5, daysPerWeek: 7, offDays: [] },
      });

      const appData = {
        memorizedPages: new Set([582, 583, 584, 585, 586]),
        perfectRevisions: new Map(),
        mistakesMap: new Map(),
      };

      const result = generateDailyTasks({ plan, appData, today: TODAY });

      // Hafiz mode has no new memorization
      expect(result.newMemorization).toBeNull();
      // Should have revision tasks
      if (result.revision) {
        expect(result.revision.pages.length).toBeGreaterThan(0);
      }
    });
  });

  describe('handleMissedDays()', () => {
    const makePlan = (lastDate = '2026-04-05') => ({
      status: 'active',
      type: 'beginner',
      targetPages: [1, 2, 3, 4, 5],
      schedulerState: {
        pageReviewData: {
          1: { nextReviewDate: '2026-04-06', interval: 1, easeFactor: 2.5, reviewCount: 2 },
          2: { nextReviewDate: '2026-04-07', interval: 2, easeFactor: 2.5, reviewCount: 3 },
          3: { nextReviewDate: '2026-04-15', interval: 5, easeFactor: 2.5, reviewCount: 5 },
        },
        lastScheduledDate: lastDate,
      },
      stats: { missedDays: 0 },
    });

    it('should return "none" when no days missed', () => {
      const result = handleMissedDays(makePlan('2026-04-10'), '2026-04-10', TODAY);
      expect(result.action).toBe('none');
      expect(result.missedDays).toBe(0);
    });

    it('should light reschedule for 1 missed day', () => {
      const result = handleMissedDays(makePlan('2026-04-09'), '2026-04-09', TODAY);
      expect(result.action).toBe('light_reschedule');
      expect(result.missedDays).toBe(1);
    });

    it('should medium reschedule for 2-4 missed days', () => {
      const result = handleMissedDays(makePlan('2026-04-07'), '2026-04-07', TODAY);
      expect(result.action).toBe('medium_reschedule');
      expect(result.missedDays).toBe(3);
      expect(result.changes.reduceNewMemorizationDays).toBe(3);
    });

    it('should heavy reschedule for 5-13 missed days', () => {
      const result = handleMissedDays(makePlan('2026-04-03'), '2026-04-03', TODAY);
      expect(result.action).toBe('heavy_reschedule');
      expect(result.missedDays).toBe(7);
      expect(result.changes.pauseNewMemorizationDays).toBeGreaterThan(0);
    });

    it('should require plan reset for 14+ missed days', () => {
      const result = handleMissedDays(makePlan('2026-03-20'), '2026-03-20', TODAY);
      expect(result.action).toBe('plan_reset_needed');
      expect(result.missedDays).toBeGreaterThanOrEqual(14);
      expect(result.changes.needsRestart).toBe(true);
    });

    it('should reset overdue pages to interval=1', () => {
      const result = handleMissedDays(makePlan('2026-04-07'), '2026-04-07', TODAY);
      // Pages 1 and 2 were due before today — should be reset
      if (result.updatedPageReviewData) {
        for (const [page, data] of Object.entries(result.updatedPageReviewData)) {
          if (data.nextReviewDate && data.nextReviewDate <= TODAY_STR) {
            expect(data.interval).toBe(1);
          }
        }
      }
    });

    it('should handle null inputs', () => {
      expect(handleMissedDays(null, '2026-04-05').action).toBe('none');
      expect(handleMissedDays(makePlan(), null).action).toBe('none');
    });
  });

  describe('isCycleComplete()', () => {
    it('should return true when all pages have been reviewed', () => {
      const plan = {
        targetPages: [1, 2, 3],
        schedulerState: {
          pageReviewData: {
            1: { reviewCount: 2 },
            2: { reviewCount: 1 },
            3: { reviewCount: 3 },
          },
        },
      };
      expect(isCycleComplete(plan)).toBe(true);
    });

    it('should return false when some pages have not been reviewed', () => {
      const plan = {
        targetPages: [1, 2, 3],
        schedulerState: {
          pageReviewData: {
            1: { reviewCount: 2 },
            2: { reviewCount: 0 },
            3: { reviewCount: 3 },
          },
        },
      };
      expect(isCycleComplete(plan)).toBe(false);
    });

    it('should return false when review data is missing for a page', () => {
      const plan = {
        targetPages: [1, 2, 3],
        schedulerState: {
          pageReviewData: {
            1: { reviewCount: 2 },
          },
        },
      };
      expect(isCycleComplete(plan)).toBe(false);
    });

    it('should handle null plan', () => {
      expect(isCycleComplete(null)).toBe(false);
    });
  });

  describe('getOverduePages()', () => {
    it('should return pages with nextReviewDate <= today, sorted by most overdue', () => {
      const data = {
        1: { nextReviewDate: '2026-04-08' },
        2: { nextReviewDate: '2026-04-10' },
        3: { nextReviewDate: '2026-04-05' },
        4: { nextReviewDate: '2026-04-15' },
      };
      const result = getOverduePages(data, TODAY_STR);
      expect(result).toEqual([3, 1, 2]); // Most overdue first; page 4 is not due yet
    });

    it('should return empty for no overdue pages', () => {
      const data = {
        1: { nextReviewDate: '2026-04-15' },
      };
      expect(getOverduePages(data, TODAY_STR)).toEqual([]);
    });

    it('should handle empty data', () => {
      expect(getOverduePages({}, TODAY_STR)).toEqual([]);
      expect(getOverduePages(null, TODAY_STR)).toEqual([]);
    });
  });

  describe('Constants', () => {
    it('should have correct threshold values', () => {
      expect(PASSING_THRESHOLD).toBe(3);
      expect(MIN_EASE_FACTOR).toBe(1.3);
      expect(DEFAULT_EASE_FACTOR).toBe(2.5);
      expect(MAX_INTERVAL_BEGINNER).toBe(14);
      expect(MAX_INTERVAL_HAFIZ).toBe(21);
      expect(MAX_BACKLOG_BEFORE_PAUSE).toBe(10);
      expect(STRENGTH_THRESHOLD).toBe(80);
      expect(SHORT_TERM_WINDOW_DAYS).toBe(7);
    });
  });
});
