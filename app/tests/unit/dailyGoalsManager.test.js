/**
 * Unit tests for dailyGoalsManager.js
 * Tests daily goal initialization, task completion, and streak calculation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDateString, daysAgo } from '../utils/testHelpers.js';

// Mock the Logger module
vi.mock('../../src/core/memorization/logger.js', () => ({
  default: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    MODULES: {
      DAILY_GOALS: 'DAILY_GOALS',
      APP: 'APP'
    }
  }
}));

// Import after mocking
const dailyGoalsModule = await import('../../src/core/memorization/dailyGoalsManager.js');
const {
  initializeTodayGoals,
  calculateReviewRange,
  completeTask,
  uncompleteTask,
  calculateStreak,
  checkAllTasksComplete,
  getTaskCounts,
  isNewDay,
  getTodayDate,
  getCompletionPercentage,
  generateDaySummary
} = dailyGoalsModule;

describe('dailyGoalsManager.js', () => {
  
  describe('initializeTodayGoals()', () => {
    it('should create goal with all default tasks', () => {
      const settings = {
        selectedTasks: ['reciteAyahs', 'recordRandomPage', 'reviewRange', 'memorizeDaily'],
        finishRevisionDays: 30,
        pagesPerDay: 2
      };
      const memorizedPages = new Set([1, 2, 3, 4, 5]);
      
      const goal = initializeTodayGoals(settings, memorizedPages, null);
      
      expect(goal.date).toBe(formatDateString(new Date()));
      expect(goal.tasks.reciteAyahs).toBeDefined();
      expect(goal.tasks.recordRandomPage).toBeDefined();
      expect(goal.tasks.reviewRange).toBeDefined();
      expect(goal.tasks.memorizeDaily).toBeDefined();
    });

    it('should only include selected tasks', () => {
      const settings = {
        selectedTasks: ['reciteAyahs', 'memorizeDaily'],
        pagesPerDay: 1
      };
      const memorizedPages = new Set([1, 2, 3]);
      
      const goal = initializeTodayGoals(settings, memorizedPages, null);
      
      expect(goal.tasks.reciteAyahs).toBeDefined();
      expect(goal.tasks.memorizeDaily).toBeDefined();
      expect(goal.tasks.recordRandomPage).toBeUndefined();
      expect(goal.tasks.reviewRange).toBeUndefined();
    });

    it('should set correct target pages for memorizeDaily', () => {
      const settings = {
        selectedTasks: ['memorizeDaily'],
        pagesPerDay: 5
      };
      
      const goal = initializeTodayGoals(settings, new Set(), null);
      
      expect(goal.tasks.memorizeDaily.targetPages).toBe(5);
    });

    it('should initialize all tasks as incomplete', () => {
      const settings = {
        selectedTasks: ['reciteAyahs', 'memorizeDaily']
      };
      
      const goal = initializeTodayGoals(settings, new Set(), null);
      
      expect(goal.tasks.reciteAyahs.completed).toBe(false);
      expect(goal.tasks.memorizeDaily.completed).toBe(false);
      expect(goal.completedCount).toBe(0);
    });
  });

  describe('calculateReviewRange()', () => {
    it('should return empty range for no memorized pages', () => {
      const result = calculateReviewRange([], 30, null);
      
      expect(result.pages).toEqual([]);
      expect(result.startPage).toBe(0);
      expect(result.endPage).toBe(0);
    });

    it('should return first chunk for new user (no lastDailyGoal)', () => {
      const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = calculateReviewRange(pages, 5, null);
      
      expect(result.rotationIndex).toBe(0);
      expect(result.chunkNumber).toBe(1);
      expect(result.totalChunks).toBe(5);
      // 10 pages / 5 chunks = 2 pages per chunk
      expect(result.pages.length).toBe(2);
      expect(result.pages).toContain(1);
      expect(result.pages).toContain(2);
    });

    it('should rotate to next chunk on new day', () => {
      const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const yesterday = formatDateString(daysAgo(1));
      const lastGoal = { date: yesterday, rotationIndex: 0 };
      
      const result = calculateReviewRange(pages, 5, lastGoal);
      
      expect(result.rotationIndex).toBe(1);
      expect(result.chunkNumber).toBe(2);
    });

    it('should wrap around after completing all chunks', () => {
      const pages = [1, 2, 3, 4, 5];
      const yesterday = formatDateString(daysAgo(1));
      const lastGoal = { date: yesterday, rotationIndex: 4 }; // Last chunk
      
      const result = calculateReviewRange(pages, 5, lastGoal);
      
      expect(result.rotationIndex).toBe(0); // Wrapped back to first
    });

    it('should handle uneven distribution fairly', () => {
      // 7 pages / 3 chunks = 2 base, 1 remainder
      // First chunk gets 3, others get 2
      const pages = [1, 2, 3, 4, 5, 6, 7];
      
      const result0 = calculateReviewRange(pages, 3, null);
      expect(result0.pages.length).toBe(3); // First chunk gets extra
      
      const yesterday = formatDateString(daysAgo(1));
      const result1 = calculateReviewRange(pages, 3, { date: yesterday, rotationIndex: 0 });
      expect(result1.pages.length).toBe(2); // Second chunk
    });
  });

  describe('completeTask()', () => {
    it('should mark task as completed', () => {
      const goal = {
        tasks: {
          reciteAyahs: { completed: false, completedAt: null }
        },
        completedCount: 0
      };
      
      const updated = completeTask(goal, 'reciteAyahs');
      
      expect(updated.tasks.reciteAyahs.completed).toBe(true);
      expect(updated.tasks.reciteAyahs.completedAt).toBeDefined();
      expect(updated.completedCount).toBe(1);
    });

    it('should store metadata if provided', () => {
      const goal = {
        tasks: {
          recordRandomPage: { completed: false }
        },
        completedCount: 0
      };
      
      const updated = completeTask(goal, 'recordRandomPage', { recordingId: 'rec-123' });
      
      expect(updated.tasks.recordRandomPage.recordingId).toBe('rec-123');
    });

    it('should not modify if task not found', () => {
      const goal = {
        tasks: {},
        completedCount: 0
      };
      
      const updated = completeTask(goal, 'nonExistent');
      
      expect(updated.completedCount).toBe(0);
    });
  });

  describe('uncompleteTask()', () => {
    it('should mark task as incomplete', () => {
      const goal = {
        tasks: {
          reciteAyahs: { completed: true, completedAt: '2026-01-12T10:00:00Z' }
        },
        completedCount: 1
      };
      
      const updated = uncompleteTask(goal, 'reciteAyahs');
      
      expect(updated.tasks.reciteAyahs.completed).toBe(false);
      expect(updated.tasks.reciteAyahs.completedAt).toBeNull();
      expect(updated.completedCount).toBe(0);
    });
  });

  describe('calculateStreak()', () => {
    // Helper to create a completed goal for a date
    const createCompletedGoal = (dateStr) => ({
      date: dateStr,
      tasks: {
        task1: { completed: true },
        task2: { completed: true }
      }
    });
    
    const createIncompleteGoal = (dateStr) => ({
      date: dateStr,
      tasks: {
        task1: { completed: true },
        task2: { completed: false }
      }
    });

    it('should return 0 for empty history', () => {
      const result = calculateStreak([], []);
      
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(0);
    });

    it('should return 0 if yesterday was incomplete', () => {
      const yesterday = formatDateString(daysAgo(1));
      const twoDaysAgo = formatDateString(daysAgo(2));
      
      const history = [
        createCompletedGoal(twoDaysAgo),
        createIncompleteGoal(yesterday) // Yesterday incomplete
      ];
      
      const result = calculateStreak(history, []);
      
      expect(result.currentStreak).toBe(0);
    });

    it('should count consecutive completed days', () => {
      const yesterday = formatDateString(daysAgo(1));
      const twoDaysAgo = formatDateString(daysAgo(2));
      const threeDaysAgo = formatDateString(daysAgo(3));
      
      const history = [
        createCompletedGoal(threeDaysAgo),
        createCompletedGoal(twoDaysAgo),
        createCompletedGoal(yesterday)
      ];
      
      const result = calculateStreak(history, []);
      
      expect(result.currentStreak).toBe(3);
    });

    it('should track longest streak separately', () => {
      // Create a gap in the streak
      const history = [
        createCompletedGoal(formatDateString(daysAgo(10))),
        createCompletedGoal(formatDateString(daysAgo(9))),
        createCompletedGoal(formatDateString(daysAgo(8))),
        createCompletedGoal(formatDateString(daysAgo(7))),
        // Gap at day 6
        createCompletedGoal(formatDateString(daysAgo(4))),
        createCompletedGoal(formatDateString(daysAgo(3))),
        createCompletedGoal(formatDateString(daysAgo(2))),
        createCompletedGoal(formatDateString(daysAgo(1)))
      ];
      
      const result = calculateStreak(history, []);
      
      expect(result.currentStreak).toBe(4); // Last 4 days
      expect(result.longestStreak).toBe(4); // Both streaks are 4
    });
  });

  describe('checkAllTasksComplete()', () => {
    it('should return true when all tasks completed', () => {
      const goal = {
        tasks: {
          task1: { completed: true },
          task2: { completed: true }
        }
      };
      
      expect(checkAllTasksComplete(goal)).toBe(true);
    });

    it('should return false when any task incomplete', () => {
      const goal = {
        tasks: {
          task1: { completed: true },
          task2: { completed: false }
        }
      };
      
      expect(checkAllTasksComplete(goal)).toBe(false);
    });

    it('should return false for empty tasks', () => {
      const goal = { tasks: {} };
      
      expect(checkAllTasksComplete(goal)).toBe(false);
    });
  });

  describe('getTaskCounts()', () => {
    it('should return correct counts', () => {
      const goal = {
        tasks: {
          task1: { completed: true },
          task2: { completed: false },
          task3: { completed: true }
        }
      };
      
      const counts = getTaskCounts(goal);
      
      expect(counts.total).toBe(3);
      expect(counts.completed).toBe(2);
    });
  });

  describe('isNewDay()', () => {
    it('should return true when lastDate is null', () => {
      expect(isNewDay(null)).toBe(true);
    });

    it('should return true when lastDate is different from today', () => {
      const yesterday = formatDateString(daysAgo(1));
      expect(isNewDay(yesterday)).toBe(true);
    });

    it('should return false when lastDate is today', () => {
      const today = formatDateString(new Date());
      expect(isNewDay(today)).toBe(false);
    });
  });

  describe('getTodayDate()', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const result = getTodayDate();
      
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result).toBe(formatDateString(new Date()));
    });
  });

  describe('getCompletionPercentage()', () => {
    it('should return 0 for no tasks', () => {
      expect(getCompletionPercentage({ tasks: {} })).toBe(0);
    });

    it('should calculate correct percentage', () => {
      const goal = {
        tasks: {
          t1: { completed: true },
          t2: { completed: false },
          t3: { completed: true },
          t4: { completed: false }
        }
      };
      
      expect(getCompletionPercentage(goal)).toBe(50);
    });

    it('should return 100 for all completed', () => {
      const goal = {
        tasks: {
          t1: { completed: true },
          t2: { completed: true }
        }
      };
      
      expect(getCompletionPercentage(goal)).toBe(100);
    });
  });

  describe('generateDaySummary()', () => {
    it('should generate complete summary', () => {
      const goal = {
        date: '2026-01-12',
        tasks: {
          t1: { completed: true },
          t2: { completed: true }
        }
      };
      
      const summary = generateDaySummary(goal);
      
      expect(summary.date).toBe('2026-01-12');
      expect(summary.completionPercentage).toBe(100);
      expect(summary.completedAllTasks).toBe(true);
      expect(summary.taskCounts.total).toBe(2);
      expect(summary.taskCounts.completed).toBe(2);
    });
  });
});
