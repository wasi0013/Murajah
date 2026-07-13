/**
 * Plan Manager
 * Handles Plan CRUD, lifecycle transitions, daily task generation,
 * and external data synchronization.
 *
 * Multiple plans can be ACTIVE simultaneously (v2).
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
  isPageMemorized,
  MEMORIZED_THRESHOLD,
} from './planScheduler.js';
import { calculateAllWeaknesses } from './weaknessScorer.js';

// --- Plan ID generation ---
function generatePlanId() {
  return `plan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// --- Juz/Surah metadata helpers ---
const QPC_PAGES_PER_JUZ = [
  /* Juz 1 */ [1, 21], [22, 41], [42, 61], [62, 81], [82, 101],
  [102, 121], [122, 141], [142, 161], [162, 181], [182, 201],
  [202, 221], [222, 241], [242, 261], [262, 281], [282, 301],
  [302, 321], [322, 341], [342, 361], [362, 381], [382, 401],
  [402, 421], [422, 441], [442, 461], [462, 481], [482, 501],
  [502, 521], [522, 541], [542, 561], [562, 581], [582, 604],
];

const INDOPAK_PAGES_PER_JUZ = [
  [1, 21], [22, 41], [42, 62], [62, 81], [82, 101],
  [102, 121], [122, 141], [142, 161], [162, 181], [182, 201],
  [201, 221], [222, 241], [242, 261], [261, 281], [282, 301],
  [302, 321], [322, 341], [342, 361], [362, 381], [381, 402],
  [402, 421], [422, 442], [442, 461], [462, 481], [482, 501],
  [502, 521], [522, 541], [542, 561], [562, 585], [586, 610],
];

const LAYOUT_TOTAL_PAGES = { qpc: 604, indopak: 610 };

// Legacy alias for backward compatibility
const PAGES_PER_JUZ = QPC_PAGES_PER_JUZ;

/**
 * Get the juz-page mapping for a given layout.
 * @param {string} [layout='qpc'] - Layout identifier ('qpc' or 'indopak')
 * @returns {number[][]} Array of [start, end] page ranges per juz
 */
export function getJuzPagesForLayout(layout = 'qpc') {
  return layout === 'indopak' ? INDOPAK_PAGES_PER_JUZ : QPC_PAGES_PER_JUZ;
}

/**
 * Get total page count for a layout.
 * @param {string} [layout='qpc']
 * @returns {number}
 */
export function getTotalPagesForLayout(layout = 'qpc') {
  return LAYOUT_TOTAL_PAGES[layout] || 604;
}

/**
 * Get pages for a given set of Juz numbers.
 * @param {number[]} juzNumbers - Array of juz numbers (1-30)
 * @param {string} [layout='qpc'] - Layout identifier
 * @returns {number[]} Sorted array of page numbers
 */
export function getPagesForJuz(juzNumbers, layout = 'qpc') {
  const juzMap = getJuzPagesForLayout(layout);
  const pages = [];
  for (const juzNum of juzNumbers) {
    if (juzNum < 1 || juzNum > 30) continue;
    const [start, end] = juzMap[juzNum - 1];
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}

/**
 * Get Juz numbers that contain the given pages.
 * @param {number[]} pages - Array of page numbers
 * @param {string} [layout='qpc'] - Layout identifier
 * @returns {number[]} Array of juz numbers
 */
export function getJuzForPages(pages, layout = 'qpc') {
  const juzMap = getJuzPagesForLayout(layout);
  const juzSet = new Set();
  for (const page of pages) {
    for (let i = 0; i < juzMap.length; i++) {
      const [start, end] = juzMap[i];
      if (page >= start && page <= end) {
        juzSet.add(i + 1);
        break;
      }
    }
  }
  return [...juzSet].sort((a, b) => a - b);
}

/**
 * Get the mode for a specific page in a mixed-mode plan.
 * Returns 'beginner' or 'hafiz' based on the juz the page belongs to.
 *
 * @param {number} page - Page number
 * @param {Object} juzModes - Map of juz number (string key) to mode ('beginner'|'hafiz')
 * @param {string} [layout='qpc'] - Layout identifier
 * @returns {string} 'beginner' or 'hafiz'
 */
export function getPageMode(page, juzModes, layout = 'qpc') {
  if (!juzModes) return 'hafiz';
  const juzMap = getJuzPagesForLayout(layout);
  for (let i = 0; i < juzMap.length; i++) {
    const [start, end] = juzMap[i];
    if (page >= start && page <= end) {
      return juzModes[i + 1] || juzModes[String(i + 1)] || 'hafiz';
    }
  }
  return 'hafiz';
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
export function generateMilestones(targetPages, startDate, pace, userType, layout = 'qpc') {
  const milestones = [];
  const juzPages = getJuzPagesForLayout(layout);
  const juzNumbers = getJuzForPages(targetPages, layout);

  // Juz completion milestones
  for (const juz of juzNumbers) {
    const [, juzEnd] = juzPages[juz - 1];
    const pagesInJuzInPlan = targetPages.filter(p => {
      const [s, e] = juzPages[juz - 1];
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
export function createPlan({ type, targetPages, pace, name = null, startDate = null, layout = 'qpc', juzModes = null }) {
  if (!targetPages || targetPages.length === 0) {
    throw new Error('Plan must have at least one target page');
  }
  if (!['beginner', 'hafiz', 'mixed'].includes(type)) {
    throw new Error('Plan type must be "beginner", "hafiz", or "mixed"');
  }

  const today = formatDate(new Date());
  const start = startDate || today;
  const sortedPages = [...targetPages].sort((a, b) => a - b);
  const juzNumbers = getJuzForPages(sortedPages, layout);

  // For mixed mode, determine pace from the dominant mode
  const hasBeginner = type === 'beginner' || (type === 'mixed' && juzModes && Object.values(juzModes).includes('beginner'));
  const revisionPagesPerDay = (type === 'beginner' || (type === 'mixed' && hasBeginner))
    ? (pace.revisionPagesPerDay || 5)
    : (pace.revisionPagesPerDay || 20);

  // Auto-generate name
  const autoName = name || (juzNumbers.length <= 3
    ? `Juz ${juzNumbers.join(', ')} Plan`
    : `${sortedPages.length}-Page Plan`);

  const normalizedPace = {
    newPagesPerDay: (type === 'beginner' || hasBeginner) ? (pace.newPagesPerDay || 1) : 0,
    revisionPagesPerDay: revisionPagesPerDay,
    daysPerWeek: pace.daysPerWeek || 6,
    offDays: Array.isArray(pace.offDays) ? pace.offDays : [5], // Default: Friday off
  };

  const endDate = estimateEndDate(start, sortedPages.length, normalizedPace, type);
  const milestones = generateMilestones(sortedPages, start, normalizedPace, type, layout);
  const pageReviewData = initializePageReviewData(sortedPages, start, revisionPagesPerDay);

  const plan = {
    id: generatePlanId(),
    name: autoName,
    type,
    layout,
    juzModes: type === 'mixed' ? (juzModes || {}) : null,

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

    // User-chosen next memorization page (auto-advances to page+1 daily)
    currentMemorizationPage: null,
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
 * Generate a smart plan automatically from existing user data.
 * Analyzes memorized pages, weakness scores, and quiz data to build an optimal plan.
 *
 * @param {Object} params
 * @param {Set<number>} params.memorizedPages - Set of memorized page numbers
 * @param {Object} params.perfectRevisions - Map of page → perfect revision count
 * @param {Object} params.mistakesMap - Map of page → mistake set/array
 * @param {Object} [params.quizScores={}] - Map of page → quiz score array
 * @param {string} [params.layout='qpc'] - 'qpc' or 'indopak'
 * @returns {Object} { planConfig, analysis } where planConfig can be passed to createPlan()
 */
export function generateSmartPlan({ memorizedPages, perfectRevisions = {}, mistakesMap = {}, quizScores = {}, layout = 'qpc' } = {}) {
  const totalPages = getTotalPagesForLayout(layout);
  const memSet = memorizedPages instanceof Set ? new Set(memorizedPages) : new Set(memorizedPages || []);

  // Also include pages that meet the perfectRevisions threshold as memorized
  const prvEntries = perfectRevisions instanceof Map ? perfectRevisions : new Map(Object.entries(perfectRevisions || {}).map(([k, v]) => [Number(k), v]));
  for (const [page, count] of prvEntries) {
    if (count >= MEMORIZED_THRESHOLD) memSet.add(page);
  }

  const memCount = memSet.size;

  // Classify user level
  const memorizedRatio = memCount / totalPages;
  let detectedType;
  if (memCount === 0) {
    detectedType = 'beginner';
  } else if (memorizedRatio >= 0.85) {
    detectedType = 'hafiz';
  } else if (memCount >= 20) {
    detectedType = 'mixed';
  } else {
    detectedType = 'beginner';
  }

  // Determine which juz are memorized and which are not
  const juzMap = getJuzPagesForLayout(layout);
  const juzAnalysis = [];

  for (let j = 0; j < 30; j++) {
    const [start, end] = juzMap[j];
    let memorized = 0;
    let total = 0;
    for (let p = start; p <= end; p++) {
      total++;
      if (memSet.has(p)) memorized++;
    }
    juzAnalysis.push({
      juz: j + 1,
      start,
      end,
      total,
      memorized,
      ratio: total > 0 ? memorized / total : 0,
    });
  }

  // Find juz the user is actively working on (partially memorized)
  const activeJuz = juzAnalysis.filter(j => j.ratio > 0 && j.ratio < 1);
  const completedJuz = juzAnalysis.filter(j => j.ratio >= 1);
  const untouchedJuz = juzAnalysis.filter(j => j.ratio === 0);

  // Build target pages: all memorized pages + pages in partially-memorized juz
  const targetPageSet = new Set();

  // Always include all memorized pages for revision
  for (const p of memSet) targetPageSet.add(p);

  // Include remaining pages in actively-worked juz (so user can continue them)
  for (const j of activeJuz) {
    for (let p = j.start; p <= j.end; p++) targetPageSet.add(p);
  }

  // If beginner with no memorized pages, pick Juz 30 as a starting scope
  if (memCount === 0) {
    const lastJuz = juzAnalysis[29];
    for (let p = lastJuz.start; p <= lastJuz.end; p++) targetPageSet.add(p);
  }

  const targetPages = [...targetPageSet].sort((a, b) => a - b);

  // Calculate weakness scores for memorized pages
  const weaknessMap = calculateAllWeaknesses({
    pages: [...memSet],
    perfectRevisions,
    mistakesMap,
    pageReviewData: {},
    quizScores,
  });

  // Count weak pages (score >= 50)
  const WEAK_THRESHOLD = 50;
  const weakPages = [...weaknessMap.entries()]
    .filter(([, score]) => score >= WEAK_THRESHOLD)
    .sort((a, b) => b[1] - a[1]);
  const weakCount = weakPages.length;

  // Determine pace based on existing volume
  let revisionPagesPerDay;
  let newPagesPerDay;
  if (detectedType === 'hafiz') {
    // Hafiz: scale revision with memorized count, no new pages
    revisionPagesPerDay = Math.max(5, Math.min(30, Math.ceil(memCount / 30)));
    newPagesPerDay = 0;
  } else if (detectedType === 'mixed') {
    // Mixed: moderate revision + slow new memorization
    revisionPagesPerDay = Math.max(5, Math.min(20, Math.ceil(memCount / 30)));
    newPagesPerDay = 1;
  } else {
    // Beginner: light revision, 1 new page
    revisionPagesPerDay = Math.max(3, Math.min(5, memCount));
    newPagesPerDay = 1;
  }

  // If many weak pages, boost revision and pause new memorization
  if (weakCount > 10 && detectedType !== 'hafiz') {
    revisionPagesPerDay = Math.max(revisionPagesPerDay, Math.min(15, weakCount));
    newPagesPerDay = 0;
  }

  // Determine juzModes for mixed type
  let juzModes = null;
  if (detectedType === 'mixed') {
    juzModes = {};
    for (const j of juzAnalysis) {
      if (j.memorized === 0) continue;
      // Juz with all pages memorized → hafiz mode
      // Juz partially memorized → beginner mode (still learning)
      if (j.ratio >= 1) {
        juzModes[j.juz] = 'hafiz';
      } else if (j.ratio > 0) {
        juzModes[j.juz] = 'beginner';
      }
    }
    // Include untouched juz that are in target pages (none for auto - but just in case)
  }

  const juzNumbers = getJuzForPages(targetPages, layout);

  // Auto name
  let name;
  if (detectedType === 'hafiz') {
    name = juzNumbers.length === 30 ? 'Full Quran Review' : `${juzNumbers.length}-Juz Review`;
  } else if (detectedType === 'mixed') {
    name = `Smart ${juzNumbers.length}-Juz Plan`;
  } else {
    name = memCount === 0 ? 'Start with Juz 30' : `Continue Memorization`;
  }

  const planConfig = {
    type: detectedType,
    targetPages,
    pace: {
      newPagesPerDay,
      revisionPagesPerDay,
      daysPerWeek: 6,
      offDays: [5], // Friday off
    },
    name,
    layout,
    juzModes,
  };

  const analysis = {
    totalMemorized: memCount,
    totalPages,
    memorizedRatio,
    detectedType,
    activeJuz: activeJuz.map(j => j.juz),
    completedJuz: completedJuz.map(j => j.juz),
    weakPageCount: weakCount,
    topWeakPages: weakPages.slice(0, 5).map(([page, score]) => ({ page, score })),
    pagesInPlan: targetPages.length,
    juzInPlan: juzNumbers,
  };

  Logger.info(Logger.MODULES.PLAN, 'Smart plan generated', {
    type: detectedType,
    memorized: memCount,
    weak: weakCount,
    targetPages: targetPages.length,
  });

  return { planConfig, analysis };
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

  // Track newly completed milestones for toast notifications
  const newlyCompletedMilestones = [];

  // Check juz milestone completion
  const juzPages = getJuzPagesForLayout(plan.layout || 'qpc');
  for (const milestone of (plan.milestones || [])) {
    if (milestone.completedDate) continue; // Already completed
    if (milestone.type === 'juz_complete') {
      const [start, end] = juzPages[milestone.juz - 1] || [0, 0];
      const juzTargetPages = plan.targetPages.filter(p => p >= start && p <= end);
      const allReviewed = juzTargetPages.length > 0 && juzTargetPages.every(p => {
        const data = plan.schedulerState.pageReviewData[p];
        return data && data.reviewCount > 0;
      });
      if (allReviewed) {
        milestone.completedDate = formatDate(today);
        newlyCompletedMilestones.push(milestone);
      }
    }
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
      newlyCompletedMilestones.push(cycleMilestone);
    }

    Logger.info(Logger.MODULES.PLAN, `Cycle ${plan.stats.revisionCyclesCompleted} complete!`, { planId: plan.id });
  }

  // Check plan completion (beginner or mixed mode with beginner juz)
  if (plan.type === 'beginner' || plan.type === 'mixed') {
    const allMemorized = plan.targetPages.every(p => {
      const data = plan.schedulerState.pageReviewData[p];
      return data && data.reviewCount > 0;
    });
    if (allMemorized && plan.stats.pagesMemorized >= plan.stats.totalPagesInPlan) {
      transitionPlanStatus(plan, 'completed');
    }
  }

  plan.stats.totalDaysActive = (plan.stats.totalDaysActive || 0) + 1;

  // Attach newly completed milestones to plan for caller to show toasts
  plan._newlyCompletedMilestones = newlyCompletedMilestones;

  return plan;
}

/**
 * Update plan streak based on today's completion.
 *
 * @param {Object} plan - The active plan (will be mutated)
 * @param {boolean} completedToday - Whether all tasks were completed today
 * @returns {Object} Updated plan
 */
export function updateStreak(plan, completedToday, today = new Date()) {
  const todayStr = formatDate(today);
  // Only update streak once per day to prevent repeated increments on reload
  if (plan.stats._lastStreakDate === todayStr) return plan;

  if (completedToday) {
    plan.stats.currentStreak = (plan.stats.currentStreak || 0) + 1;
    if (plan.stats.currentStreak > (plan.stats.longestStreak || 0)) {
      plan.stats.longestStreak = plan.stats.currentStreak;
    }
  } else {
    plan.stats.currentStreak = 0;
  }
  plan.stats._lastStreakDate = todayStr;
  return plan;
}

/**
 * Advance the user's chosen memorization page to the next unmemorized page.
 * Called after new memorization task is completed for the day.
 *
 * @param {Object} plan - The active plan (will be mutated)
 * @param {Set} memorizedPages - Current memorized pages set
 * @param {Object|Map} perfectRevisions - Map of page → perfect revision count
 * @returns {number|null} The new currentMemorizationPage, or null if none left
 */
export function advanceMemorizationPage(plan, memorizedPages, perfectRevisions = {}) {
  if (!plan.currentMemorizationPage) return null;

  const currentPage = plan.currentMemorizationPage;
  const targetPages = plan.targetPages || [];

  // Find the next unmemorized page after the current one
  const currentIdx = targetPages.indexOf(currentPage);
  if (currentIdx === -1) {
    plan.currentMemorizationPage = null;
    return null;
  }

  for (let i = currentIdx + 1; i < targetPages.length; i++) {
    if (!isPageMemorized(targetPages[i], memorizedPages, perfectRevisions)) {
      plan.currentMemorizationPage = targetPages[i];
      return targetPages[i];
    }
  }

  // No more unmemorized pages after the current one
  plan.currentMemorizationPage = null;
  return null;
}

/**
 * Sync external memorization — when user marks pages as memorized outside the plan,
 * update the plan's tracking.
 *
 * @param {Object} plan - The active plan (will be mutated)
 * @param {Set} currentMemorizedPages - The full current set of memorized pages
 * @returns {Object} { newlyMemorizedInPlan: number[], plan }
 */
export function syncExternalMemorization(plan, currentMemorizedPages, perfectRevisions = {}) {
  const newlyMemorized = [];

  for (const page of plan.targetPages) {
    if (isPageMemorized(page, currentMemorizedPages, perfectRevisions)) {
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
  const memorizedInPlan = plan.targetPages.filter(p => isPageMemorized(p, currentMemorizedPages, perfectRevisions));
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
      metadata: tasks?.metadata || null,
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

  // Deep-clone to strip Vue reactive proxies before IDB structured clone
  const plainPlan = JSON.parse(JSON.stringify(plan));
  const tx = db.transaction(['plans'], 'readwrite');
  tx.objectStore('plans').put(plainPlan);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      Logger.debug(Logger.MODULES.PLAN, 'Plan saved', { planId: plainPlan.id });
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
 * Load ALL active plans from IndexedDB.
 * @param {IDBDatabase} db - The database reference
 * @returns {Object[]} Array of active plan objects
 */
export async function loadActivePlans(db) {
  if (!db || !db.objectStoreNames.contains('plans')) {
    return [];
  }

  const tx = db.transaction(['plans'], 'readonly');
  const store = tx.objectStore('plans');
  const index = store.index('status');

  return new Promise((resolve, reject) => {
    const request = index.getAll('active');
    request.onsuccess = () => resolve(request.result || []);
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

  // Deep-clone to strip Vue reactive proxies before IDB structured clone
  const plainRecord = JSON.parse(JSON.stringify(record));
  const tx = db.transaction(['planHistory'], 'readwrite');
  tx.objectStore('planHistory').put(plainRecord);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load today's day record from IndexedDB (if it exists).
 * Used to restore completed task states on page reload.
 * @param {IDBDatabase} db - The database reference
 * @param {string} planId - Plan ID
 * @param {Date} [today] - Override today's date (for testing)
 * @returns {Object|null} The day record for today, or null
 */
export async function loadTodayDayRecord(db, planId, today = new Date()) {
  if (!db || !db.objectStoreNames.contains('planHistory')) return null;
  const todayStr = formatDate(today);
  const recordId = `${planId}_${todayStr}`;
  const tx = db.transaction(['planHistory'], 'readonly');
  const store = tx.objectStore('planHistory');
  return new Promise((resolve, reject) => {
    const request = store.get(recordId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Load plan history for a date range.
 * @param {IDBDatabase} db - The database reference
 * @param {string} planId - Plan ID
 * @param {number} [daysBack=90] - Number of days to look back
 * @param {Date} [today] - Override today's date (for testing)
 * @returns {Object[]} Array of PlanDayRecord objects
 */
export async function loadPlanHistory(db, planId, daysBack = 90, today = new Date()) {
  if (!db || !db.objectStoreNames.contains('planHistory')) {
    return [];
  }

  const tx = db.transaction(['planHistory'], 'readonly');
  const store = tx.objectStore('planHistory');
  const index = store.index('planId');

  return new Promise((resolve, reject) => {
    const request = index.getAll(planId);
    request.onsuccess = () => {
      const cutoff = new Date(today);
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
  advanceMemorizationPage,

  // Day records
  createDayRecord,
  planTasksToDailyGoals,

  // DB operations
  savePlan,
  loadActivePlan,
  loadPlan,
  loadAllPlans,
  saveDayRecord,
  loadTodayDayRecord,
  loadPlanHistory,

  // Helpers
  getPagesForJuz,
  getJuzForPages,
  estimateEndDate,
  generateMilestones,
};
