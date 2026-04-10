/**
 * Plan Manager
 * Handles Plan CRUD, lifecycle transitions, daily task generation,
 * and external data synchronization.
 *
 * Invariant: Only 1 plan can be ACTIVE at a time (v1).
 *
 * The plan system READS from existing app data (memorizedPages, perfectRevisions,
 * mistakesMap, settingsStore). It WRITES only to `plans` and `planHistory` stores.
 * It GENERATES tasks that flow into the existing dailyGoals system.
 */

import Logger from './logger.js';
import {
  generateDailyTasks,
  handleMissedDays,
  isCycleComplete,
  initializePageReviewData,
  calculateNextReview,
  mapToPerformance,
  formatDate,
} from './planScheduler.js';

// --- Plan ID generation ---
function generatePlanId() {
  return `plan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// --- Juz/Surah metadata helpers ---
const PAGES_PER_JUZ = [
  /* Juz 1 */ [1, 21], [22, 41], [42, 61], [62, 81], [82, 101],
  [102, 121], [122, 141], [142, 161], [162, 181], [182, 201],
  [202, 221], [222, 241], [242, 261], [262, 281], [282, 301],
  [302, 321], [322, 341], [342, 361], [362, 381], [382, 401],
  [402, 421], [422, 441], [442, 461], [462, 481], [482, 501],
  [502, 521], [522, 541], [542, 561], [562, 581], [582, 604],
];

/**
 * Get pages for a given set of Juz numbers.
 * @param {number[]} juzNumbers - Array of juz numbers (1-30)
 * @returns {number[]} Sorted array of page numbers
 */
export function getPagesForJuz(juzNumbers) {
  const pages = [];
  for (const juzNum of juzNumbers) {
    if (juzNum < 1 || juzNum > 30) continue;
    const [start, end] = PAGES_PER_JUZ[juzNum - 1];
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}

/**
 * Get Juz numbers that contain the given pages.
 * @param {number[]} pages - Array of page numbers
 * @returns {number[]} Array of juz numbers
 */
export function getJuzForPages(pages) {
  const juzSet = new Set();
  for (const page of pages) {
    for (let i = 0; i < PAGES_PER_JUZ.length; i++) {
      const [start, end] = PAGES_PER_JUZ[i];
      if (page >= start && page <= end) {
        juzSet.add(i + 1);
        break;
      }
    }
  }
  return [...juzSet].sort((a, b) => a - b);
}

/**
 * Estimate the plan end date based on pace and scope.
 * @param {string} startDate - YYYY-MM-DD
 * @param {number} totalPages - Total pages in plan
 * @param {Object} pace - Pace configuration
 * @param {string} userType - "beginner" or "hafiz"
 * @returns {string} Estimated end date YYYY-MM-DD
 */
export function estimateEndDate(startDate, totalPages, pace, userType) {
  const activeDaysPerWeek = pace.daysPerWeek || 6;
  let totalActiveDays;

  if (userType === 'beginner') {
    const newPagesPerDay = pace.newPagesPerDay || 1;
    // Time to memorize all pages + 1 full revision cycle
    const memorizationDays = Math.ceil(totalPages / newPagesPerDay);
    const revisionDays = Math.ceil(totalPages / (pace.revisionPagesPerDay || 5));
    totalActiveDays = memorizationDays + revisionDays;
  } else {
    // Hafiz: time for one full cycle
    const revisionPagesPerDay = pace.revisionPagesPerDay || 20;
    totalActiveDays = Math.ceil(totalPages / revisionPagesPerDay);
  }

  // Convert active days to calendar days (accounting for off days)
  const calendarDays = Math.ceil(totalActiveDays * (7 / activeDaysPerWeek));

  const start = new Date(startDate + 'T00:00:00');
  start.setDate(start.getDate() + calendarDays);
  return formatDate(start);
}

/**
 * Generate milestones for a plan.
 * @param {number[]} targetPages - Sorted page numbers in plan
 * @param {string} startDate - YYYY-MM-DD
 * @param {Object} pace - Pace configuration
 * @param {string} userType - "beginner" or "hafiz"
 * @returns {Object[]} Array of milestone objects
 */
export function generateMilestones(targetPages, startDate, pace, userType) {
  const milestones = [];
  const juzNumbers = getJuzForPages(targetPages);

  // Juz completion milestones
  for (const juz of juzNumbers) {
    const [, juzEnd] = PAGES_PER_JUZ[juz - 1];
    const pagesInJuzInPlan = targetPages.filter(p => {
      const [s, e] = PAGES_PER_JUZ[juz - 1];
      return p >= s && p <= e;
    });

    if (pagesInJuzInPlan.length > 0) {
      // Estimate when this juz will be reached
      const lastPageIndex = targetPages.indexOf(pagesInJuzInPlan[pagesInJuzInPlan.length - 1]);
      const pagesPerDay = userType === 'beginner'
        ? (pace.newPagesPerDay || 1)
        : (pace.revisionPagesPerDay || 20);
      const daysToReach = Math.ceil((lastPageIndex + 1) / pagesPerDay);
      const activeDaysPerWeek = pace.daysPerWeek || 6;
      const calendarDays = Math.ceil(daysToReach * (7 / activeDaysPerWeek));

      const targetDate = new Date(startDate + 'T00:00:00');
      targetDate.setDate(targetDate.getDate() + calendarDays);

      milestones.push({
        id: `m_juz_${juz}`,
        type: 'juz_complete',
        juz,
        targetDate: formatDate(targetDate),
        completedDate: null,
      });
    }
  }

  // Cycle completion milestone
  milestones.push({
    id: 'm_cycle_1',
    type: 'cycle_complete',
    cycle: 1,
    targetDate: estimateEndDate(startDate, targetPages.length, pace, userType),
    completedDate: null,
  });

  return milestones;
}

// ============================
// Plan CRUD Operations
// ============================

/**
 * Create a new memorization/revision plan.
 *
 * @param {Object} params
 * @param {string} params.type - "beginner" or "hafiz"
 * @param {number[]} params.targetPages - Ordered page numbers
 * @param {Object} params.pace - { newPagesPerDay, revisionPagesPerDay, daysPerWeek, offDays }
 * @param {string} [params.name] - Plan name (auto-generated if not provided)
 * @param {string} [params.startDate] - YYYY-MM-DD (defaults to today)
 * @returns {Object} The created plan object (not yet saved to DB)
 */
export function createPlan({ type, targetPages, pace, name = null, startDate = null }) {
  if (!targetPages || targetPages.length === 0) {
    throw new Error('Plan must have at least one target page');
  }
  if (!['beginner', 'hafiz'].includes(type)) {
    throw new Error('Plan type must be "beginner" or "hafiz"');
  }

  const today = formatDate(new Date());
  const start = startDate || today;
  const sortedPages = [...targetPages].sort((a, b) => a - b);
  const juzNumbers = getJuzForPages(sortedPages);
  const revisionPagesPerDay = type === 'beginner'
    ? (pace.revisionPagesPerDay || 5)
    : (pace.revisionPagesPerDay || 20);

  // Auto-generate name
  const autoName = name || (juzNumbers.length <= 3
    ? `Juz ${juzNumbers.join(', ')} Plan`
    : `${sortedPages.length}-Page Plan`);

  const normalizedPace = {
    newPagesPerDay: type === 'beginner' ? (pace.newPagesPerDay || 1) : 0,
    revisionPagesPerDay: revisionPagesPerDay,
    daysPerWeek: pace.daysPerWeek || 6,
    offDays: pace.offDays || [5], // Default: Friday off
  };

  const endDate = estimateEndDate(start, sortedPages.length, normalizedPace, type);
  const milestones = generateMilestones(sortedPages, start, normalizedPace, type);
  const pageReviewData = initializePageReviewData(sortedPages, start, revisionPagesPerDay);

  const plan = {
    id: generatePlanId(),
    name: autoName,
    type,

    targetPages: sortedPages,
    targetJuz: juzNumbers,

    createdAt: new Date().toISOString(),
    startDate: start,
    endDate,
    pace: normalizedPace,

    status: 'active',
    currentCycleNumber: 1,
    totalCycles: null,

    stats: {
      totalPagesInPlan: sortedPages.length,
      pagesMemorized: 0,
      pagesReviewed: 0,
      revisionCyclesCompleted: 0,
      currentStreak: 0,
      longestStreak: 0,
      missedDays: 0,
      totalDaysActive: 0,
      weakPageCount: 0,
    },

    schedulerState: {
      pageReviewData,
      lastScheduledDate: null,
      backlogPages: [],
    },

    milestones,
  };

  Logger.info(Logger.MODULES.PLAN, 'Plan created', {
    id: plan.id,
    type,
    pages: sortedPages.length,
    juz: juzNumbers,
  });

  return plan;
}

/**
 * Transition plan to a new status.
 *
 * @param {Object} plan - The plan object (will be mutated)
 * @param {string} newStatus - "active" | "paused" | "completed" | "abandoned"
 * @returns {Object} The updated plan
 */
export function transitionPlanStatus(plan, newStatus) {
  const validTransitions = {
    active: ['paused', 'completed', 'abandoned'],
    paused: ['active', 'abandoned'],
    completed: [],
    abandoned: [],
  };

  if (!validTransitions[plan.status]?.includes(newStatus)) {
    throw new Error(`Invalid transition: ${plan.status} → ${newStatus}`);
  }

  const oldStatus = plan.status;
  plan.status = newStatus;

  Logger.info(Logger.MODULES.PLAN, `Plan status: ${oldStatus} → ${newStatus}`, { planId: plan.id });

  return plan;
}

/**
 * Update plan pace settings and recalculate end date.
 *
 * @param {Object} plan - The plan object (will be mutated)
 * @param {Object} newPace - Partial pace update
 * @returns {Object} The updated plan
 */
export function updatePlanPace(plan, newPace) {
  plan.pace = { ...plan.pace, ...newPace };
  plan.endDate = estimateEndDate(
    formatDate(new Date()),
    plan.targetPages.length - (plan.stats.pagesMemorized || 0),
    plan.pace,
    plan.type
  );

  // Recalculate milestone dates
  plan.milestones = generateMilestones(
    plan.targetPages,
    formatDate(new Date()),
    plan.pace,
    plan.type
  );

  Logger.info(Logger.MODULES.PLAN, 'Plan pace updated', { planId: plan.id, pace: plan.pace });

  return plan;
}

/**
 * Generate today's tasks for the active plan.
 * Combines SM-2 scheduling with weakness scoring.
 *
 * @param {Object} plan - The active plan
 * @param {Object} appData - { memorizedPages, perfectRevisions, mistakesMap }
 * @param {Object} [quizScores] - Map<pageNum, accuracy>
 * @param {Date} [today] - Override today's date (for testing)
 * @returns {Object|null} Daily task set, or null if no plan/off day
 */
export function getTodayTasks(plan, appData, quizScores = {}, today = new Date()) {
  if (!plan || plan.status !== 'active') return null;

  const todayStr = formatDate(today);

  // Check for missed days
  const lastActive = plan.schedulerState?.lastScheduledDate;
  if (lastActive && lastActive < todayStr) {
    const missedResult = handleMissedDays(plan, lastActive, today);
    if (missedResult.action !== 'none') {
      // Apply rescheduling changes
      if (missedResult.updatedPageReviewData) {
        plan.schedulerState.pageReviewData = missedResult.updatedPageReviewData;
      }
      plan.stats.missedDays += missedResult.missedDays;

      if (missedResult.action === 'plan_reset_needed') {
        return {
          newMemorization: null,
          revision: null,
          weakReinforcement: null,
          metadata: {
            date: todayStr,
            needsRestart: true,
            missedDays: missedResult.missedDays,
          },
        };
      }
    }
  }

  // Generate tasks via scheduler
  const tasks = generateDailyTasks({ plan, appData, quizScores, today });

  // Update last scheduled date
  plan.schedulerState.lastScheduledDate = todayStr;

  return tasks;
}

/**
 * Record task completion and update SM-2 review data.
 *
 * @param {Object} plan - The active plan (will be mutated)
 * @param {string} taskType - "newMemorization" | "revision" | "weakReinforcement"
 * @param {number[]} pages - Pages that were completed
 * @param {string} performance - "perfect" | "good" | "needs_work"
 * @param {Object} appData - { perfectRevisions, mistakesMap }
 * @param {Date} [today] - Override today's date (for testing)
 * @returns {Object} Updated plan
 */
export function recordTaskCompletion(plan, taskType, pages, performance, appData, today = new Date()) {
  const { perfectRevisions = new Map(), mistakesMap = new Map() } = appData || {};

  for (const page of pages) {
    const existingData = plan.schedulerState.pageReviewData[page] || {};
    const perfectCount = perfectRevisions.get?.(page) ?? perfectRevisions[page] ?? 0;
    const mistakeSet = mistakesMap.get?.(page) ?? mistakesMap[page];
    const mistakeCount = mistakeSet ? (mistakeSet.size ?? mistakeSet.length ?? 0) : 0;

    // Map to SM-2 performance
    const perfScore = mapToPerformance({
      perfectRevisionCount: perfectCount,
      mistakeCount,
      userRating: performance,
    });

    // Update SM-2 data
    const updated = calculateNextReview(existingData, perfScore, plan.type, today);
    plan.schedulerState.pageReviewData[page] = {
      ...existingData,
      ...updated,
      reviewCount: (existingData.reviewCount || 0) + 1,
    };
  }

  // Update stats
  const reviewedPages = new Set(
    Object.entries(plan.schedulerState.pageReviewData)
      .filter(([, d]) => d.reviewCount > 0)
      .map(([p]) => Number(p))
  );
  plan.stats.pagesReviewed = reviewedPages.size;

  if (taskType === 'newMemorization') {
    plan.stats.pagesMemorized = (plan.stats.pagesMemorized || 0) + pages.length;
  }

  // Check cycle completion (hafiz mode)
  if (plan.type === 'hafiz' && isCycleComplete(plan)) {
    plan.stats.revisionCyclesCompleted += 1;
    plan.currentCycleNumber += 1;

    // Mark cycle milestone
    const cycleMilestone = plan.milestones.find(
      m => m.type === 'cycle_complete' && m.cycle === plan.stats.revisionCyclesCompleted && !m.completedDate
    );
    if (cycleMilestone) {
      cycleMilestone.completedDate = formatDate(today);
    }

    Logger.info(Logger.MODULES.PLAN, `Cycle ${plan.stats.revisionCyclesCompleted} complete!`, { planId: plan.id });
  }

  // Check plan completion (beginner mode)
  if (plan.type === 'beginner') {
    const allMemorized = plan.targetPages.every(p => {
      const data = plan.schedulerState.pageReviewData[p];
      return data && data.reviewCount > 0;
    });
    if (allMemorized && plan.stats.pagesMemorized >= plan.stats.totalPagesInPlan) {
      transitionPlanStatus(plan, 'completed');
    }
  }

  plan.stats.totalDaysActive = (plan.stats.totalDaysActive || 0) + 1;

  return plan;
}

/**
 * Update plan streak based on today's completion.
 *
 * @param {Object} plan - The active plan (will be mutated)
 * @param {boolean} completedToday - Whether all tasks were completed today
 * @returns {Object} Updated plan
 */
export function updateStreak(plan, completedToday) {
  if (completedToday) {
    plan.stats.currentStreak = (plan.stats.currentStreak || 0) + 1;
    if (plan.stats.currentStreak > (plan.stats.longestStreak || 0)) {
      plan.stats.longestStreak = plan.stats.currentStreak;
    }
  } else {
    plan.stats.currentStreak = 0;
  }
  return plan;
}

/**
 * Sync external memorization — when user marks pages as memorized outside the plan,
 * update the plan's tracking.
 *
 * @param {Object} plan - The active plan (will be mutated)
 * @param {Set} currentMemorizedPages - The full current set of memorized pages
 * @returns {Object} { newlyMemorizedInPlan: number[], plan }
 */
export function syncExternalMemorization(plan, currentMemorizedPages) {
  const newlyMemorized = [];

  for (const page of plan.targetPages) {
    if (currentMemorizedPages.has(page)) {
      const data = plan.schedulerState.pageReviewData[page];
      if (data && data.reviewCount === 0) {
        // Page was memorized outside the plan — initialize review data
        plan.schedulerState.pageReviewData[page] = {
          ...data,
          lastReviewDate: formatDate(new Date()),
          nextReviewDate: formatDate(new Date(Date.now() + 86400000)),
          interval: 1,
          reviewCount: 1,
          consecutiveCorrect: 1,
        };
        newlyMemorized.push(page);
      }
    }
  }

  // Update memorized count
  const memorizedInPlan = plan.targetPages.filter(p => currentMemorizedPages.has(p));
  plan.stats.pagesMemorized = memorizedInPlan.length;

  if (newlyMemorized.length > 0) {
    Logger.info(Logger.MODULES.PLAN, 'External memorization synced', {
      planId: plan.id,
      newPages: newlyMemorized.length,
    });
  }

  return { newlyMemorizedInPlan: newlyMemorized, plan };
}

/**
 * Create a PlanDayRecord for today's tasks.
 *
 * @param {string} planId - Plan ID
 * @param {Object} tasks - Daily tasks from generateDailyTasks
 * @param {Date} [today] - Override today's date (for testing)
 * @returns {Object} PlanDayRecord
 */
export function createDayRecord(planId, tasks, today = new Date()) {
  const todayStr = formatDate(today);

  let totalTasks = 0;
  if (tasks?.newMemorization) totalTasks++;
  if (tasks?.revision) totalTasks++;
  if (tasks?.weakReinforcement) totalTasks++;

  return {
    id: `${planId}_${todayStr}`,
    planId,
    date: todayStr,
    tasks: {
      newMemorization: tasks?.newMemorization || null,
      revision: tasks?.revision || null,
      weakReinforcement: tasks?.weakReinforcement || null,
    },
    summary: {
      totalTasks,
      completedTasks: 0,
      status: totalTasks > 0 ? 'pending' : 'missed',
      missedReason: totalTasks === 0 ? 'inactive' : null,
    },
  };
}

/**
 * Convert plan tasks to daily goal tasks for the existing dailyGoals system.
 * This bridges the plan with the current daily goals UI.
 *
 * @param {Object} planTasks - Tasks from generateDailyTasks
 * @param {Object} plan - The active plan
 * @returns {Object} Tasks compatible with dailyGoalsManager format
 */
export function planTasksToDailyGoals(planTasks, plan) {
  if (!planTasks || planTasks.metadata?.isOffDay) {
    return null;
  }

  const goals = {};

  if (planTasks.newMemorization) {
    goals.planMemorize = {
      name: 'Plan: Memorize new page(s)',
      description: `Memorize page(s): ${planTasks.newMemorization.pages.join(', ')}`,
      completed: false,
      completedAt: null,
      pages: planTasks.newMemorization.pages,
      planId: plan.id,
      taskType: 'newMemorization',
    };
  }

  if (planTasks.revision) {
    goals.planRevision = {
      name: 'Plan: Review pages',
      description: `Review page(s): ${planTasks.revision.pages.join(', ')}`,
      completed: false,
      completedAt: null,
      pages: planTasks.revision.pages,
      planId: plan.id,
      taskType: 'revision',
    };
  }

  if (planTasks.weakReinforcement) {
    goals.planReinforce = {
      name: 'Plan: Reinforce weak pages',
      description: `Extra review: page(s) ${planTasks.weakReinforcement.pages.join(', ')}`,
      completed: false,
      completedAt: null,
      pages: planTasks.weakReinforcement.pages,
      planId: plan.id,
      taskType: 'weakReinforcement',
    };
  }

  return Object.keys(goals).length > 0 ? goals : null;
}

// ============================
// DB Operations (pass db ref)
// ============================

/**
 * Save a plan to IndexedDB.
 * @param {IDBDatabase} db - The database reference
 * @param {Object} plan - Plan object to save
 */
export async function savePlan(db, plan) {
  if (!db || !db.objectStoreNames.contains('plans')) {
    Logger.warn(Logger.MODULES.PLAN, 'Plans store not available — skipping save');
    return;
  }

  const tx = db.transaction(['plans'], 'readwrite');
  tx.objectStore('plans').put(plan);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      Logger.debug(Logger.MODULES.PLAN, 'Plan saved', { planId: plan.id });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load the active plan from IndexedDB.
 * @param {IDBDatabase} db - The database reference
 * @returns {Object|null} The active plan, or null
 */
export async function loadActivePlan(db) {
  if (!db || !db.objectStoreNames.contains('plans')) {
    return null;
  }

  const tx = db.transaction(['plans'], 'readonly');
  const store = tx.objectStore('plans');
  const index = store.index('status');

  return new Promise((resolve, reject) => {
    const request = index.getAll('active');
    request.onsuccess = () => {
      const results = request.result;
      resolve(results && results.length > 0 ? results[0] : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load a plan by ID from IndexedDB.
 * @param {IDBDatabase} db - The database reference
 * @param {string} planId - Plan ID
 * @returns {Object|null} The plan, or null
 */
export async function loadPlan(db, planId) {
  if (!db || !db.objectStoreNames.contains('plans')) {
    return null;
  }

  const tx = db.transaction(['plans'], 'readonly');
  return new Promise((resolve, reject) => {
    const request = tx.objectStore('plans').get(planId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load all plans from IndexedDB.
 * @param {IDBDatabase} db - The database reference
 * @returns {Object[]} Array of plan objects
 */
export async function loadAllPlans(db) {
  if (!db || !db.objectStoreNames.contains('plans')) {
    return [];
  }

  const tx = db.transaction(['plans'], 'readonly');
  return new Promise((resolve, reject) => {
    const request = tx.objectStore('plans').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a plan day record to IndexedDB.
 * @param {IDBDatabase} db - The database reference
 * @param {Object} record - PlanDayRecord object
 */
export async function saveDayRecord(db, record) {
  if (!db || !db.objectStoreNames.contains('planHistory')) {
    Logger.warn(Logger.MODULES.PLAN, 'planHistory store not available — skipping save');
    return;
  }

  const tx = db.transaction(['planHistory'], 'readwrite');
  tx.objectStore('planHistory').put(record);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load plan history for a date range.
 * @param {IDBDatabase} db - The database reference
 * @param {string} planId - Plan ID
 * @param {number} [daysBack=90] - Number of days to look back
 * @returns {Object[]} Array of PlanDayRecord objects
 */
export async function loadPlanHistory(db, planId, daysBack = 90) {
  if (!db || !db.objectStoreNames.contains('planHistory')) {
    return [];
  }

  const tx = db.transaction(['planHistory'], 'readonly');
  const store = tx.objectStore('planHistory');
  const index = store.index('planId');

  return new Promise((resolve, reject) => {
    const request = index.getAll(planId);
    request.onsuccess = () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
      const cutoffStr = formatDate(cutoff);

      const results = (request.result || [])
        .filter(r => r.date >= cutoffStr)
        .sort((a, b) => a.date.localeCompare(b.date));
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export default {
  // Plan CRUD
  createPlan,
  transitionPlanStatus,
  updatePlanPace,

  // Task generation
  getTodayTasks,
  recordTaskCompletion,
  updateStreak,

  // Data sync
  syncExternalMemorization,

  // Day records
  createDayRecord,
  planTasksToDailyGoals,

  // DB operations
  savePlan,
  loadActivePlan,
  loadPlan,
  loadAllPlans,
  saveDayRecord,
  loadPlanHistory,

  // Helpers
  getPagesForJuz,
  getJuzForPages,
  estimateEndDate,
  generateMilestones,
};
