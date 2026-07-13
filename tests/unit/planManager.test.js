/**
 * Unit tests for planManager.js
 * Tests Plan CRUD, lifecycle, task generation bridging, and DB operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

// Mock the Logger module
vi.mock('../../source/resources/js/utils/logger.js', () => ({
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
  createPlan,
  transitionPlanStatus,
  updatePlanPace,
  getTodayTasks,
  recordTaskCompletion,
  updateStreak,
  syncExternalMemorization,
  createDayRecord,
  planTasksToDailyGoals,
  savePlan,
  loadActivePlan,
  loadPlan,
  loadAllPlans,
  saveDayRecord,
  loadTodayDayRecord,
  loadPlanHistory,
  getPagesForJuz,
  getJuzForPages,
  estimateEndDate,
  generateMilestones,
} = await import('../../source/resources/js/utils/planManager.js');

describe('planManager.js', () => {
  describe('getPagesForJuz()', () => {
    it('should return pages for Juz 30', () => {
      const pages = getPagesForJuz([30]);
      expect(pages[0]).toBe(582);
      expect(pages[pages.length - 1]).toBe(604);
      expect(pages.length).toBe(23);
    });

    it('should return pages for Juz 1', () => {
      const pages = getPagesForJuz([1]);
      expect(pages[0]).toBe(1);
      expect(pages[pages.length - 1]).toBe(21);
    });

    it('should handle multiple juz numbers', () => {
      const pages = getPagesForJuz([29, 30]);
      expect(pages[0]).toBe(562); // Juz 29 starts at 562
      expect(pages[pages.length - 1]).toBe(604);
    });

    it('should ignore invalid juz numbers', () => {
      const pages = getPagesForJuz([0, 31, -1]);
      expect(pages.length).toBe(0);
    });

    it('should return sorted unique pages', () => {
      const pages = getPagesForJuz([30, 30]); // Duplicate
      const uniqueCheck = new Set(pages);
      expect(pages.length).toBe(uniqueCheck.size);
      for (let i = 1; i < pages.length; i++) {
        expect(pages[i]).toBeGreaterThan(pages[i - 1]);
      }
    });
  });

  describe('getJuzForPages()', () => {
    it('should return Juz 30 for pages 582-604', () => {
      expect(getJuzForPages([582, 590, 604])).toEqual([30]);
    });

    it('should return multiple juz numbers', () => {
      expect(getJuzForPages([1, 100, 582])).toEqual([1, 5, 30]);
    });

    it('should handle empty input', () => {
      expect(getJuzForPages([])).toEqual([]);
    });
  });

  describe('createPlan()', () => {
    it('should create a beginner plan', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: [582, 583, 584, 585, 586],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3, daysPerWeek: 6, offDays: [5] },
      });

      expect(plan.id).toMatch(/^plan_\d+_[a-z0-9]+$/);
      expect(plan.type).toBe('beginner');
      expect(plan.status).toBe('active');
      expect(plan.targetPages).toEqual([582, 583, 584, 585, 586]);
      expect(plan.targetJuz).toEqual([30]);
      expect(plan.pace.newPagesPerDay).toBe(1);
      expect(plan.stats.totalPagesInPlan).toBe(5);
      expect(plan.stats.pagesMemorized).toBe(0);
      expect(plan.schedulerState.pageReviewData).toBeDefined();
      expect(Object.keys(plan.schedulerState.pageReviewData).length).toBe(5);
    });

    it('should create a hafiz plan', () => {
      const plan = createPlan({
        type: 'hafiz',
        targetPages: getPagesForJuz([30]),
        pace: { revisionPagesPerDay: 10, daysPerWeek: 7, offDays: [] },
      });

      expect(plan.type).toBe('hafiz');
      expect(plan.pace.newPagesPerDay).toBe(0);
      expect(plan.targetPages.length).toBe(23);
    });

    it('should auto-generate name from juz numbers', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: getPagesForJuz([30]),
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 5 },
      });
      expect(plan.name).toContain('Juz');
      expect(plan.name).toContain('30');
    });

    it('should use custom name if provided', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: [1, 2, 3],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 },
        name: 'My Custom Plan',
      });
      expect(plan.name).toBe('My Custom Plan');
    });

    it('should throw on empty target pages', () => {
      expect(() => createPlan({ type: 'beginner', targetPages: [], pace: {} }))
        .toThrow('at least one target page');
    });

    it('should throw on invalid type', () => {
      expect(() => createPlan({ type: 'invalid', targetPages: [1], pace: {} }))
        .toThrow('beginner');
    });

    it('should sort target pages', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: [5, 3, 1, 4, 2],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 },
      });
      expect(plan.targetPages).toEqual([1, 2, 3, 4, 5]);
    });

    it('should generate milestones', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: getPagesForJuz([30]),
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 5 },
      });
      expect(plan.milestones.length).toBeGreaterThan(0);
      // Should have a juz completion milestone
      const juzMilestone = plan.milestones.find(m => m.type === 'juz_complete');
      expect(juzMilestone).toBeDefined();
      expect(juzMilestone.juz).toBe(30);
    });

    it('should have endDate in the future', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: [1, 2, 3, 4, 5],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 },
      });
      const today = new Date().toISOString().split('T')[0];
      expect(plan.endDate >= today).toBe(true);
    });
  });

  describe('transitionPlanStatus()', () => {
    it('should transition active → paused', () => {
      const plan = { status: 'active', id: 'test' };
      transitionPlanStatus(plan, 'paused');
      expect(plan.status).toBe('paused');
    });

    it('should transition active → completed', () => {
      const plan = { status: 'active', id: 'test' };
      transitionPlanStatus(plan, 'completed');
      expect(plan.status).toBe('completed');
    });

    it('should transition active → abandoned', () => {
      const plan = { status: 'active', id: 'test' };
      transitionPlanStatus(plan, 'abandoned');
      expect(plan.status).toBe('abandoned');
    });

    it('should transition paused → active', () => {
      const plan = { status: 'paused', id: 'test' };
      transitionPlanStatus(plan, 'active');
      expect(plan.status).toBe('active');
    });

    it('should throw on invalid transition completed → active', () => {
      const plan = { status: 'completed', id: 'test' };
      expect(() => transitionPlanStatus(plan, 'active')).toThrow('Invalid transition');
    });

    it('should throw on invalid transition abandoned → active', () => {
      const plan = { status: 'abandoned', id: 'test' };
      expect(() => transitionPlanStatus(plan, 'active')).toThrow('Invalid transition');
    });
  });

  describe('updateStreak()', () => {
    it('should increment streak on completion', () => {
      const plan = { stats: { currentStreak: 5, longestStreak: 10 } };
      updateStreak(plan, true);
      expect(plan.stats.currentStreak).toBe(6);
    });

    it('should reset streak on miss', () => {
      const plan = { stats: { currentStreak: 5, longestStreak: 10 } };
      updateStreak(plan, false);
      expect(plan.stats.currentStreak).toBe(0);
    });

    it('should update longest streak', () => {
      const plan = { stats: { currentStreak: 10, longestStreak: 10 } };
      updateStreak(plan, true);
      expect(plan.stats.longestStreak).toBe(11);
    });

    it('should not update longest streak if current is lower', () => {
      const plan = { stats: { currentStreak: 3, longestStreak: 10 } };
      updateStreak(plan, true);
      expect(plan.stats.longestStreak).toBe(10);
    });

    it('should only update streak once per day (date-idempotent)', () => {
      const plan = { stats: { currentStreak: 5, longestStreak: 10 } };
      const today = new Date('2026-04-14');
      updateStreak(plan, true, today);
      expect(plan.stats.currentStreak).toBe(6);
      // Second call same day should be no-op
      updateStreak(plan, true, today);
      expect(plan.stats.currentStreak).toBe(6);
      // Even a false call same day should be no-op
      updateStreak(plan, false, today);
      expect(plan.stats.currentStreak).toBe(6);
    });

    it('should allow streak update on a new day', () => {
      const plan = { stats: { currentStreak: 5, longestStreak: 10 } };
      updateStreak(plan, true, new Date('2026-04-14'));
      expect(plan.stats.currentStreak).toBe(6);
      updateStreak(plan, true, new Date('2026-04-15'));
      expect(plan.stats.currentStreak).toBe(7);
    });
  });

  describe('syncExternalMemorization()', () => {
    it('should sync pages memorized outside the plan', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: [1, 2, 3, 4, 5],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 },
      });

      const memorized = new Set([1, 2, 3]);
      const { newlyMemorizedInPlan, plan: updated } = syncExternalMemorization(plan, memorized);

      expect(newlyMemorizedInPlan.length).toBe(3); // Only pages in memorized set with reviewCount=0
      expect(updated.stats.pagesMemorized).toBe(3);
    });

    it('should not double-count already tracked pages', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: [1, 2, 3],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 },
      });
      // Simulate page 1 already reviewed
      plan.schedulerState.pageReviewData[1].reviewCount = 2;

      const memorized = new Set([1, 2]);
      const { newlyMemorizedInPlan } = syncExternalMemorization(plan, memorized);

      // Page 1 was already tracked (reviewCount > 0), so only page 2 is "new"
      expect(newlyMemorizedInPlan).not.toContain(1);
      expect(newlyMemorizedInPlan).toContain(2);
    });
  });

  describe('createDayRecord()', () => {
    it('should create a day record with all task types', () => {
      const tasks = {
        newMemorization: { pages: [1], completed: false },
        revision: { pages: [2, 3], completed: false },
        weakReinforcement: { pages: [4], completed: false },
      };

      const record = createDayRecord('plan_123', tasks, new Date('2026-04-10'));

      expect(record.id).toBe('plan_123_2026-04-10');
      expect(record.planId).toBe('plan_123');
      expect(record.date).toBe('2026-04-10');
      expect(record.summary.totalTasks).toBe(3);
      expect(record.summary.status).toBe('pending');
    });

    it('should handle missing tasks', () => {
      const record = createDayRecord('plan_123', { revision: { pages: [1] } }, new Date('2026-04-10'));
      expect(record.summary.totalTasks).toBe(1);
      expect(record.tasks.newMemorization).toBeNull();
      expect(record.tasks.weakReinforcement).toBeNull();
    });

    it('should mark as missed when no tasks', () => {
      const record = createDayRecord('plan_123', {}, new Date('2026-04-10'));
      expect(record.summary.status).toBe('missed');
      expect(record.summary.missedReason).toBe('inactive');
    });
  });

  describe('planTasksToDailyGoals()', () => {
    it('should convert plan tasks to daily goals format', () => {
      const tasks = {
        newMemorization: { pages: [1] },
        revision: { pages: [2, 3] },
        weakReinforcement: { pages: [4] },
        metadata: { isOffDay: false },
      };
      const plan = { id: 'plan_123' };

      const goals = planTasksToDailyGoals(tasks, plan);

      expect(goals.planMemorize).toBeDefined();
      expect(goals.planMemorize.pages).toEqual([1]);
      expect(goals.planMemorize.planId).toBe('plan_123');

      expect(goals.planRevision).toBeDefined();
      expect(goals.planRevision.pages).toEqual([2, 3]);

      expect(goals.planReinforce).toBeDefined();
    });

    it('should return null on off day', () => {
      const tasks = { metadata: { isOffDay: true } };
      expect(planTasksToDailyGoals(tasks, {})).toBeNull();
    });

    it('should return null for null tasks', () => {
      expect(planTasksToDailyGoals(null, {})).toBeNull();
    });

    it('should only include non-null task types', () => {
      const tasks = {
        newMemorization: null,
        revision: { pages: [1, 2] },
        weakReinforcement: null,
        metadata: { isOffDay: false },
      };
      const goals = planTasksToDailyGoals(tasks, { id: 'test' });

      expect(goals.planMemorize).toBeUndefined();
      expect(goals.planRevision).toBeDefined();
      expect(goals.planReinforce).toBeUndefined();
    });
  });

  describe('estimateEndDate()', () => {
    it('should estimate beginner end date', () => {
      const end = estimateEndDate('2026-04-10', 10, {
        newPagesPerDay: 1,
        revisionPagesPerDay: 5,
        daysPerWeek: 7,
      }, 'beginner');

      // 10 pages / 1 new/day = 10 days memorization + 10/5 = 2 revision = 12 active days
      expect(end).toBeDefined();
      expect(end > '2026-04-10').toBe(true);
    });

    it('should estimate hafiz end date', () => {
      const end = estimateEndDate('2026-04-10', 604, {
        revisionPagesPerDay: 20,
        daysPerWeek: 6,
      }, 'hafiz');

      // 604/20 = ~31 active days → ~36 calendar days
      expect(end).toBeDefined();
      expect(end > '2026-05-01').toBe(true);
    });

    it('should account for off days in calendar calculation', () => {
      const end6days = estimateEndDate('2026-04-10', 30, {
        revisionPagesPerDay: 5,
        daysPerWeek: 6,
      }, 'hafiz');

      const end7days = estimateEndDate('2026-04-10', 30, {
        revisionPagesPerDay: 5,
        daysPerWeek: 7,
      }, 'hafiz');

      // 6 days/week should result in a later end date
      expect(end6days >= end7days).toBe(true);
    });
  });

  describe('DB Operations', () => {
    let db;

    beforeEach(async () => {
      // Create a test database with plan stores
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('test-plan-db', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          db = request.result;
          resolve();
        };
        request.onupgradeneeded = (event) => {
          const testDb = event.target.result;
          const planStore = testDb.createObjectStore('plans', { keyPath: 'id' });
          planStore.createIndex('status', 'status', { unique: false });
          planStore.createIndex('type', 'type', { unique: false });

          const historyStore = testDb.createObjectStore('planHistory', { keyPath: 'id' });
          historyStore.createIndex('planId', 'planId', { unique: false });
          historyStore.createIndex('date', 'date', { unique: false });
          historyStore.createIndex('planId_date', ['planId', 'date'], { unique: true });
        };
      });
    });

    afterEach(() => {
      if (db) db.close();
      indexedDB.deleteDatabase('test-plan-db');
    });

    it('should save and load a plan', async () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: [1, 2, 3],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 },
      });

      await savePlan(db, plan);
      const loaded = await loadPlan(db, plan.id);

      expect(loaded).toBeDefined();
      expect(loaded.id).toBe(plan.id);
      expect(loaded.type).toBe('beginner');
      expect(loaded.targetPages).toEqual([1, 2, 3]);
    });

    it('should load active plan', async () => {
      const plan1 = createPlan({
        type: 'beginner',
        targetPages: [1, 2],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 },
      });
      const plan2 = createPlan({
        type: 'hafiz',
        targetPages: [3, 4],
        pace: { revisionPagesPerDay: 5 },
      });
      plan2.status = 'completed';

      await savePlan(db, plan1);
      await savePlan(db, plan2);

      const active = await loadActivePlan(db);
      expect(active).toBeDefined();
      expect(active.id).toBe(plan1.id);
    });

    it('should return null when no active plan', async () => {
      const active = await loadActivePlan(db);
      expect(active).toBeNull();
    });

    it('should load all plans', async () => {
      const plan1 = createPlan({ type: 'beginner', targetPages: [1], pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 } });
      const plan2 = createPlan({ type: 'hafiz', targetPages: [2], pace: { revisionPagesPerDay: 5 } });

      await savePlan(db, plan1);
      await savePlan(db, plan2);

      const all = await loadAllPlans(db);
      expect(all.length).toBe(2);
    });

    it('should save and load day records', async () => {
      // Constructed as a local date (not parsed from a UTC date-only string) so the
      // resulting date string is stable regardless of the test runner's timezone.
      const recordDate = new Date(2026, 3, 10); // April 10, 2026
      const record = createDayRecord('plan_123', {
        revision: { pages: [1, 2], completed: false },
      }, recordDate);

      await saveDayRecord(db, record);
      // Pass the same fixed date as "today" so the 90-day lookback window is anchored
      // to the test's own timeline instead of the real wall clock — otherwise this test
      // would start failing once the real date drifted more than 90 days past recordDate.
      const history = await loadPlanHistory(db, 'plan_123', 90, recordDate);

      expect(history.length).toBe(1);
      expect(history[0].date).toBe('2026-04-10');
    });

    it('should load today day record by composite key', async () => {
      const tasks = {
        newMemorization: { pages: [5], completed: true, completedAt: '2026-04-14T10:00:00Z' },
        revision: { pages: [1, 2], completed: true, completedAt: '2026-04-14T10:05:00Z' },
        weakReinforcement: null,
        metadata: { date: '2026-04-14', isOffDay: false },
      };
      const record = createDayRecord('plan_abc', tasks, new Date('2026-04-14'));
      await saveDayRecord(db, record);

      const loaded = await loadTodayDayRecord(db, 'plan_abc', new Date('2026-04-14'));
      expect(loaded).not.toBeNull();
      expect(loaded.tasks.newMemorization.completed).toBe(true);
      expect(loaded.tasks.revision.completed).toBe(true);
      expect(loaded.tasks.metadata.isOffDay).toBe(false);
    });

    it('should return null when no day record exists for today', async () => {
      const loaded = await loadTodayDayRecord(db, 'plan_abc', new Date('2026-04-14'));
      expect(loaded).toBeNull();
    });

    it('should include metadata in createDayRecord', () => {
      const tasks = {
        newMemorization: { pages: [1], completed: false },
        revision: null,
        weakReinforcement: null,
        metadata: { date: '2026-04-14', isOffDay: false, backlogSize: 3 },
      };
      const record = createDayRecord('plan_xyz', tasks, new Date('2026-04-14'));
      expect(record.tasks.metadata).toEqual({ date: '2026-04-14', isOffDay: false, backlogSize: 3 });
    });

    it('should handle missing plans store gracefully', async () => {
      // Create a DB without plans store
      const plainDb = await new Promise((resolve, reject) => {
        const request = indexedDB.open('plain-db', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (e) => {
          e.target.result.createObjectStore('other', { keyPath: 'id' });
        };
      });

      const result = await loadActivePlan(plainDb);
      expect(result).toBeNull();

      const all = await loadAllPlans(plainDb);
      expect(all).toEqual([]);

      plainDb.close();
      indexedDB.deleteDatabase('plain-db');
    });

    it('should handle null db gracefully', async () => {
      expect(await loadActivePlan(null)).toBeNull();
      expect(await loadAllPlans(null)).toEqual([]);
      expect(await loadPlanHistory(null, 'x')).toEqual([]);
    });
  });

  describe('recordTaskCompletion()', () => {
    it('should update SM-2 review data after task completion', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: [1, 2, 3],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 },
      });

      const appData = {
        perfectRevisions: new Map([[1, 2]]),
        mistakesMap: new Map(),
      };

      recordTaskCompletion(plan, 'revision', [1], 'good', appData, new Date('2026-04-10'));

      expect(plan.schedulerState.pageReviewData[1].reviewCount).toBe(1);
      expect(plan.schedulerState.pageReviewData[1].lastReviewDate).toBe('2026-04-10');
      expect(plan.stats.pagesReviewed).toBeGreaterThanOrEqual(1);
    });

    it('should track new memorization pages', () => {
      const plan = createPlan({
        type: 'beginner',
        targetPages: [1, 2, 3],
        pace: { newPagesPerDay: 1, revisionPagesPerDay: 3 },
      });

      const initialMemorized = plan.stats.pagesMemorized;
      recordTaskCompletion(plan, 'newMemorization', [1], 'perfect', {}, new Date('2026-04-10'));
      expect(plan.stats.pagesMemorized).toBe(initialMemorized + 1);
    });
  });
});
