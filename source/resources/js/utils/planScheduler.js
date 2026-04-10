/**
 * Plan Scheduler
 * Modified SM-2 spaced repetition algorithm adapted for Quran memorization.
 * Handles interval calculation, daily task generation, and missed day rescheduling.
 *
 * Key adaptations from vanilla SM-2:
 *   - Interval caps: 14 days (beginner) / 21 days (hafiz)
 *   - Backlog awareness: overdue pages get priority
 *   - Overload prevention: daily page budget is respected
 *   - Juz balancing (hafiz mode): prevents uneven coverage
 */

import Logger from './logger.js';
import { calculateAllWeaknesses, getWeakestPages } from './weaknessScorer.js';

// --- SM-2 Constants ---
const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;
const MAX_INTERVAL_BEGINNER = 14;
const MAX_INTERVAL_HAFIZ = 21;

// Performance thresholds (SM-2 uses 0-5)
const PERFORMANCE = {
  TOTAL_FAILURE: 0,
  MAJOR_MISTAKES: 1,
  MINOR_MISTAKES: 2,
  HESITATION: 3,
  CORRECT: 4,
  PERFECT: 5,
};

// Minimum performance to count as "passing" (no reset)
const PASSING_THRESHOLD = 3;

// Backlog limits
const MAX_BACKLOG_BEFORE_PAUSE = 10;
const MAX_WEAK_REINFORCEMENT_BEGINNER = 2;
const MAX_WEAK_REINFORCEMENT_HAFIZ = 3;
const WEAK_THRESHOLD_BEGINNER = 60;
const WEAK_THRESHOLD_HAFIZ = 50;

// Short-term revision window (days)
const SHORT_TERM_WINDOW_DAYS = 7;

/**
 * Calculate the next review date and updated SM-2 parameters for a page.
 *
 * @param {Object} pageReviewData - Current review data for the page
 * @param {number} pageReviewData.interval - Current interval in days
 * @param {number} pageReviewData.easeFactor - Current SM-2 ease factor
 * @param {number} pageReviewData.consecutiveCorrect - Streak of passing reviews
 * @param {number} performance - Performance rating 0-5
 * @param {string} userType - "beginner" or "hafiz"
 * @param {Date} [today] - Override today's date (for testing)
 * @returns {Object} Updated review data { interval, easeFactor, nextReviewDate, consecutiveCorrect }
 */
export function calculateNextReview(pageReviewData, performance, userType, today = new Date()) {
  let { interval = 1, easeFactor = DEFAULT_EASE_FACTOR, consecutiveCorrect = 0 } = pageReviewData || {};

  // Clamp performance to valid range
  const perf = Math.max(0, Math.min(5, Math.round(performance)));

  if (perf < PASSING_THRESHOLD) {
    // Failed — reset interval
    interval = 1;
    consecutiveCorrect = 0;
  } else {
    // Passed — increase interval
    if (consecutiveCorrect === 0) {
      interval = 1;
    } else if (consecutiveCorrect === 1) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    consecutiveCorrect += 1;
  }

  // Update ease factor (SM-2 formula)
  easeFactor = Math.max(
    MIN_EASE_FACTOR,
    easeFactor + (0.1 - (5 - perf) * (0.08 + (5 - perf) * 0.02))
  );

  // Cap interval based on user type
  const maxInterval = userType === 'beginner' ? MAX_INTERVAL_BEGINNER : MAX_INTERVAL_HAFIZ;
  interval = Math.min(interval, maxInterval);

  // Calculate next review date
  const nextDate = new Date(today);
  nextDate.setDate(nextDate.getDate() + interval);
  const nextReviewDate = formatDate(nextDate);

  return {
    interval,
    easeFactor: Math.round(easeFactor * 100) / 100, // Round to 2 decimal places
    nextReviewDate,
    consecutiveCorrect,
    lastReviewDate: formatDate(today),
  };
}

/**
 * Map existing app data to a SM-2 performance score (0-5).
 *
 * @param {Object} params
 * @param {number} params.perfectRevisionCount - From perfectRevisions Map
 * @param {number} params.mistakeCount - Number of word mistakes on this page
 * @param {number} [params.quizAccuracy] - 0-1 quiz accuracy (null if no quiz data)
 * @param {string} [params.userRating] - "perfect" | "good" | "needs_work" (from task completion)
 * @returns {number} Performance score 0-5
 */
export function mapToPerformance({ perfectRevisionCount = 0, mistakeCount = 0, quizAccuracy = null, userRating = null } = {}) {
  // Start with base from perfect revisions
  let base;
  if (perfectRevisionCount >= 3) base = 5;
  else if (perfectRevisionCount === 2) base = 4;
  else if (perfectRevisionCount === 1) base = 3;
  else base = 2;

  // Adjust for mistakes
  if (mistakeCount >= 3) base -= 2;
  else if (mistakeCount >= 1) base -= 1;

  // Adjust for quiz accuracy
  if (quizAccuracy !== null && quizAccuracy !== undefined) {
    if (quizAccuracy > 0.9) base += 1;
    else if (quizAccuracy < 0.5) base -= 1;
  }

  // Override with user self-report if provided
  if (userRating === 'perfect') base = Math.max(base, 4);
  else if (userRating === 'needs_work') base = Math.min(base, 2);

  // Clamp to 0-5
  return Math.max(0, Math.min(5, base));
}

/**
 * Generate daily tasks based on plan type and SM-2 schedule.
 *
 * @param {Object} params
 * @param {Object} params.plan - The plan object
 * @param {Object} params.appData - { memorizedPages, perfectRevisions, mistakesMap }
 * @param {Object} [params.quizScores] - Map<pageNum, accuracy>
 * @param {Date} [params.today] - Override today's date (for testing)
 * @returns {Object} Daily task set { newMemorization, revision, weakReinforcement, metadata }
 */
export function generateDailyTasks({ plan, appData, quizScores = {}, today = new Date() } = {}) {
  if (!plan || plan.status !== 'active') {
    return null;
  }

  const todayStr = formatDate(today);
  const { pace, type: userType, targetPages, schedulerState } = plan;
  const { memorizedPages = new Set(), perfectRevisions = new Map(), mistakesMap = new Map() } = appData || {};

  // Check if today is an off day
  const dayOfWeek = today.getDay(); // 0=Sunday
  if (pace.offDays && pace.offDays.includes(dayOfWeek)) {
    return {
      newMemorization: null,
      revision: null,
      weakReinforcement: null,
      metadata: { isOffDay: true, date: todayStr },
    };
  }

  const pageReviewData = schedulerState?.pageReviewData || {};

  // Calculate weakness scores for all plan pages
  const weaknessMap = calculateAllWeaknesses({
    pages: targetPages,
    perfectRevisions,
    mistakesMap,
    pageReviewData,
    quizScores,
    today,
  });

  if (userType === 'beginner') {
    return generateBeginnerTasks({ plan, memorizedPages, pageReviewData, weaknessMap, pace, targetPages, todayStr, today });
  } else {
    return generateHafizTasks({ plan, pageReviewData, weaknessMap, pace, targetPages, todayStr, today });
  }
}

/**
 * Generate daily tasks for beginner mode.
 */
function generateBeginnerTasks({ plan, memorizedPages, pageReviewData, weaknessMap, pace, targetPages, todayStr, today }) {
  const newPagesPerDay = pace.newPagesPerDay || 1;
  const revisionPerDay = pace.revisionPagesPerDay || 5;

  // 1. NEW MEMORIZATION — next N unmemorized pages in sequence
  const unmemorizedInPlan = targetPages.filter(p => !memorizedPages.has(p));

  // Check if backlog is too large — pause new memorization
  const overdue = getOverduePages(pageReviewData, todayStr);
  const pauseNew = overdue.length > MAX_BACKLOG_BEFORE_PAUSE;

  let newMemorizationPages = [];
  if (!pauseNew && unmemorizedInPlan.length > 0) {
    newMemorizationPages = unmemorizedInPlan.slice(0, newPagesPerDay);
  }

  // 2. SHORT-TERM REVISION — recently memorized pages (last 7 days)
  const shortTermPages = getShortTermPages(pageReviewData, targetPages, todayStr, today);
  const shortTermBudget = Math.min(3, Math.ceil(revisionPerDay * 0.4));
  const shortTermRevision = shortTermPages.slice(0, shortTermBudget);

  // 3. LONG-TERM REVISION — SM-2 scheduled pages
  const longTermBudget = revisionPerDay - shortTermRevision.length;
  const longTermPages = overdue
    .filter(p => !shortTermRevision.includes(p))
    .slice(0, Math.max(0, longTermBudget));

  // Combine revision pages
  const allRevisionPages = [...new Set([...shortTermRevision, ...longTermPages])];

  // 4. WEAK REINFORCEMENT — top weak pages not already scheduled
  const alreadyScheduled = new Set([...newMemorizationPages, ...allRevisionPages]);
  const weakPages = getWeakestPages(weaknessMap, MAX_WEAK_REINFORCEMENT_BEGINNER, [...alreadyScheduled])
    .filter(p => {
      const score = weaknessMap.get(p);
      return score !== undefined && score > WEAK_THRESHOLD_BEGINNER;
    });

  return {
    newMemorization: newMemorizationPages.length > 0
      ? { pages: newMemorizationPages, completed: false, completedAt: null }
      : null,
    revision: allRevisionPages.length > 0
      ? { pages: allRevisionPages, source: 'scheduled', completed: false, completedAt: null, performance: null }
      : null,
    weakReinforcement: weakPages.length > 0
      ? { pages: weakPages, reason: 'weakness_score_high', completed: false, completedAt: null, performance: null }
      : null,
    metadata: {
      date: todayStr,
      isOffDay: false,
      backlogSize: overdue.length,
      pausedNewMemorization: pauseNew,
      totalPages: newMemorizationPages.length + allRevisionPages.length + weakPages.length,
    },
  };
}

/**
 * Generate daily tasks for hafiz mode.
 */
function generateHafizTasks({ plan, pageReviewData, weaknessMap, pace, targetPages, todayStr, today }) {
  const revisionPerDay = pace.revisionPagesPerDay || 20;

  // 1. CYCLE REVISION — pages due today, sorted by overdue + sequential order
  const overduePages = getOverduePages(pageReviewData, todayStr);
  let cyclePages = overduePages.slice(0, revisionPerDay);

  // If fewer due than budget, pull forward pages due tomorrow
  if (cyclePages.length < revisionPerDay) {
    const tomorrowStr = formatDate(addDays(today, 1));
    const tomorrowDue = getDuePages(pageReviewData, tomorrowStr, targetPages)
      .filter(p => !cyclePages.includes(p));
    const pullForwardCount = revisionPerDay - cyclePages.length;
    cyclePages = [...cyclePages, ...tomorrowDue.slice(0, pullForwardCount)];
  }

  // If still fewer than budget, pick unreviewed pages in sequential order
  if (cyclePages.length < revisionPerDay) {
    const reviewed = new Set(cyclePages);
    const unreviewedInPlan = targetPages.filter(p => !reviewed.has(p) && !pageReviewData[p]?.lastReviewDate);
    const fillCount = revisionPerDay - cyclePages.length;
    cyclePages = [...cyclePages, ...unreviewedInPlan.slice(0, fillCount)];
  }

  // 2. WEAK REINFORCEMENT
  const alreadyScheduled = new Set(cyclePages);
  const weakPages = getWeakestPages(weaknessMap, MAX_WEAK_REINFORCEMENT_HAFIZ, [...alreadyScheduled])
    .filter(p => {
      const score = weaknessMap.get(p);
      return score !== undefined && score > WEAK_THRESHOLD_HAFIZ;
    });

  return {
    newMemorization: null,
    revision: cyclePages.length > 0
      ? { pages: cyclePages, source: 'scheduled', completed: false, completedAt: null, performance: null }
      : null,
    weakReinforcement: weakPages.length > 0
      ? { pages: weakPages, reason: 'weakness_score_high', completed: false, completedAt: null, performance: null }
      : null,
    metadata: {
      date: todayStr,
      isOffDay: false,
      backlogSize: overduePages.length,
      pausedNewMemorization: false,
      totalPages: cyclePages.length + weakPages.length,
    },
  };
}

/**
 * Handle missed days and reschedule overdue pages.
 *
 * @param {Object} plan - The plan object
 * @param {string} lastActiveDate - Last date the user had plan activity (YYYY-MM-DD)
 * @param {Date} [today] - Override today's date (for testing)
 * @returns {Object} { action, missedDays, changes }
 */
export function handleMissedDays(plan, lastActiveDate, today = new Date()) {
  if (!plan || !lastActiveDate) {
    return { action: 'none', missedDays: 0, changes: {} };
  }

  const todayStr = formatDate(today);
  const lastDate = new Date(lastActiveDate + 'T00:00:00');
  const todayDate = new Date(todayStr + 'T00:00:00');
  const missedDays = Math.floor((todayDate - lastDate) / 86400000);

  if (missedDays <= 0) {
    return { action: 'none', missedDays: 0, changes: {} };
  }

  const pageReviewData = { ...(plan.schedulerState?.pageReviewData || {}) };

  let action;
  let changes = {};

  if (missedDays === 1) {
    // LIGHT: move overdue to next 1-2 days
    action = 'light_reschedule';
    redistributeOverdue(pageReviewData, todayStr, 2);
  } else if (missedDays <= 4) {
    // MEDIUM: spread over 3 days, reduce new memorization
    action = 'medium_reschedule';
    redistributeOverdue(pageReviewData, todayStr, 3);
    changes.reduceNewMemorizationDays = 3;
    changes.newMemorizationMultiplier = 0.5;
  } else if (missedDays <= 13) {
    // HEAVY: pause new, recalculate all intervals
    action = 'heavy_reschedule';
    recalculateAllIntervals(pageReviewData, todayStr);
    changes.pauseNewMemorizationDays = Math.ceil(missedDays / 2);
  } else {
    // 14+ days: plan needs restart
    action = 'plan_reset_needed';
    changes.needsRestart = true;
  }

  // Mark all overdue pages with interval=1 (review ASAP)
  if (action !== 'plan_reset_needed') {
    for (const [page, data] of Object.entries(pageReviewData)) {
      if (data.nextReviewDate && data.nextReviewDate < todayStr) {
        pageReviewData[page] = { ...data, interval: 1, nextReviewDate: todayStr };
      }
    }
  }

  Logger.info(Logger.MODULES.PLAN, `Missed days handled: ${missedDays} days, action=${action}`);

  return {
    action,
    missedDays,
    changes,
    updatedPageReviewData: pageReviewData,
  };
}

/**
 * Check if a full revision cycle is complete (hafiz mode).
 *
 * @param {Object} plan - The plan object
 * @returns {boolean} True if all target pages have been reviewed in this cycle
 */
export function isCycleComplete(plan) {
  if (!plan || !plan.targetPages) return false;

  const reviewData = plan.schedulerState?.pageReviewData || {};
  return plan.targetPages.every(page => {
    const data = reviewData[page];
    return data && data.reviewCount > 0;
  });
}

/**
 * Initialize SM-2 review data for a set of pages (when creating a new plan).
 *
 * @param {number[]} pages - Pages in the plan
 * @param {string} startDate - Plan start date (YYYY-MM-DD)
 * @param {number} pagesPerDay - How many pages to schedule per day
 * @returns {Object} Map of pageNum → initial review data
 */
export function initializePageReviewData(pages, startDate, pagesPerDay) {
  const reviewData = {};
  const dailyBatches = Math.ceil(pages.length / Math.max(1, pagesPerDay));

  for (let i = 0; i < pages.length; i++) {
    const dayOffset = Math.floor(i / Math.max(1, pagesPerDay));
    const scheduledDate = formatDate(addDays(new Date(startDate + 'T00:00:00'), dayOffset));

    reviewData[pages[i]] = {
      lastReviewDate: null,
      nextReviewDate: scheduledDate,
      interval: 1,
      easeFactor: DEFAULT_EASE_FACTOR,
      reviewCount: 0,
      consecutiveCorrect: 0,
      weaknessScore: 50, // Default neutral score
    };
  }

  return reviewData;
}

// --- Internal Helpers ---

/**
 * Get pages that are overdue for review (nextReviewDate < today), sorted by most overdue first.
 */
function getOverduePages(pageReviewData, todayStr) {
  return Object.entries(pageReviewData || {})
    .filter(([_, data]) => data.nextReviewDate && data.nextReviewDate <= todayStr)
    .sort((a, b) => {
      // Most overdue first
      if (a[1].nextReviewDate !== b[1].nextReviewDate) {
        return a[1].nextReviewDate.localeCompare(b[1].nextReviewDate);
      }
      // Then by page number
      return Number(a[0]) - Number(b[0]);
    })
    .map(([page]) => Number(page));
}

/**
 * Get pages due on or before a specific date.
 */
function getDuePages(pageReviewData, dateStr, targetPages) {
  const targetSet = new Set(targetPages);
  return Object.entries(pageReviewData || {})
    .filter(([page, data]) => targetSet.has(Number(page)) && data.nextReviewDate && data.nextReviewDate <= dateStr)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([page]) => Number(page));
}

/**
 * Get recently memorized/reviewed pages (within short-term window).
 */
function getShortTermPages(pageReviewData, targetPages, todayStr, today) {
  const windowStart = formatDate(addDays(today, -SHORT_TERM_WINDOW_DAYS));

  return targetPages.filter(page => {
    const data = pageReviewData[page];
    if (!data || !data.lastReviewDate) return false;
    return data.lastReviewDate >= windowStart && data.reviewCount <= 3;
  }).sort((a, b) => {
    // Most recent first
    const aDate = pageReviewData[a]?.lastReviewDate || '';
    const bDate = pageReviewData[b]?.lastReviewDate || '';
    return bDate.localeCompare(aDate);
  });
}

/**
 * Redistribute overdue pages across the next N days (for missed day handling).
 */
function redistributeOverdue(pageReviewData, todayStr, spreadDays) {
  const overdue = Object.entries(pageReviewData)
    .filter(([_, d]) => d.nextReviewDate && d.nextReviewDate < todayStr)
    .map(([page]) => Number(page))
    .sort((a, b) => a - b);

  const pagesPerDay = Math.ceil(overdue.length / spreadDays);

  for (let i = 0; i < overdue.length; i++) {
    const dayOffset = Math.floor(i / pagesPerDay);
    const newDate = formatDate(addDays(new Date(todayStr + 'T00:00:00'), dayOffset));
    const page = overdue[i];
    if (pageReviewData[page]) {
      pageReviewData[page] = { ...pageReviewData[page], nextReviewDate: newDate, interval: 1 };
    }
  }
}

/**
 * After a long absence, recalculate all intervals to 1 (reset scheduling).
 */
function recalculateAllIntervals(pageReviewData, todayStr) {
  for (const page of Object.keys(pageReviewData)) {
    pageReviewData[page] = {
      ...pageReviewData[page],
      interval: 1,
      nextReviewDate: todayStr,
      consecutiveCorrect: 0,
      // Keep ease factor — it still reflects long-term learning
    };
  }
}

/**
 * Format a Date object as YYYY-MM-DD string.
 */
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add N days to a date.
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Export constants for testing
export {
  PERFORMANCE,
  PASSING_THRESHOLD,
  MIN_EASE_FACTOR,
  DEFAULT_EASE_FACTOR,
  MAX_INTERVAL_BEGINNER,
  MAX_INTERVAL_HAFIZ,
  MAX_BACKLOG_BEFORE_PAUSE,
  WEAK_THRESHOLD_BEGINNER,
  WEAK_THRESHOLD_HAFIZ,
  SHORT_TERM_WINDOW_DAYS,
};

// Export internal helpers for testing
export { formatDate, addDays, getOverduePages };

export default {
  calculateNextReview,
  mapToPerformance,
  generateDailyTasks,
  handleMissedDays,
  isCycleComplete,
  initializePageReviewData,
};
