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
import { getPageMode } from './planManager.js';

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

// Hifz strength threshold: pages with perfectRevisions count < this are weak
const STRENGTH_THRESHOLD = 80;

// Memorized threshold: pages with perfectRevisions count >= this are considered memorized
export const MEMORIZED_THRESHOLD = 40;

// Short-term revision window (days)
const SHORT_TERM_WINDOW_DAYS = 7;

/**
 * Check if a page is considered memorized.
 * A page is memorized if it's in the memorizedPages set OR has perfectRevisions >= MEMORIZED_THRESHOLD.
 *
 * @param {number} page - Page number
 * @param {Set} memorizedPages - Set of manually-marked memorized pages
 * @param {Object|Map} perfectRevisions - Map/object of page → perfect revision count
 * @returns {boolean}
 */
export function isPageMemorized(page, memorizedPages, perfectRevisions) {
  if (memorizedPages && memorizedPages.has(page)) return true;
  const count = perfectRevisions?.get?.(page) ?? perfectRevisions?.[page] ?? 0;
  return count >= MEMORIZED_THRESHOLD;
}

/**
 * Get the hifz score for a page (capped at 100).
 * @param {number} page
 * @param {Object|Map} perfectRevisions
 * @returns {number}
 */
function getPageHifzScore(page, perfectRevisions) {
  return Math.min(perfectRevisions?.get?.(page) ?? perfectRevisions?.[page] ?? 0, 100);
}

/**
 * Build a sorted array of ALL memorized pages regardless of plan scope.
 * Includes pages from the memorizedPages set and pages with perfectRevisions >= MEMORIZED_THRESHOLD.
 *
 * @param {Set} memorizedPages
 * @param {Map|Object} perfectRevisions
 * @returns {number[]} Sorted array of all memorized page numbers
 */
function getAllMemorizedPagesList(memorizedPages, perfectRevisions) {
  const pages = new Set();
  if (memorizedPages) {
    for (const p of memorizedPages) pages.add(Number(p));
  }
  if (perfectRevisions) {
    const entries = perfectRevisions.entries ? [...perfectRevisions.entries()] : Object.entries(perfectRevisions);
    for (const [p, count] of entries) {
      if (count >= MEMORIZED_THRESHOLD) pages.add(Number(p));
    }
  }
  return [...pages].sort((a, b) => a - b);
}

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
  else if (userRating === 'good') base = Math.max(base, 3);
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

  // Check if today is an off day — only skip new memorization, still do revision/weak
  const dayOfWeek = today.getDay(); // 0=Sunday
  const isOffDay = pace.offDays && pace.offDays.includes(dayOfWeek);

  const pageReviewData = schedulerState?.pageReviewData || {};

  // Build list of ALL memorized pages (regardless of plan scope) for revision/weak reinforcement
  const allMemorizedPages = getAllMemorizedPagesList(memorizedPages, perfectRevisions);

  // Calculate weakness scores for ALL memorized pages (not just plan pages)
  const weaknessMap = calculateAllWeaknesses({
    pages: allMemorizedPages,
    perfectRevisions,
    mistakesMap,
    pageReviewData,
    quizScores,
    today,
  });

  if (userType === 'beginner') {
    return generateBeginnerTasks({ plan, memorizedPages, pageReviewData, weaknessMap, perfectRevisions, pace, targetPages, allMemorizedPages, todayStr, today, isOffDay });
  } else if (userType === 'mixed') {
    return generateMixedTasks({ plan, memorizedPages, pageReviewData, weaknessMap, perfectRevisions, pace, targetPages, allMemorizedPages, todayStr, today, isOffDay });
  } else {
    return generateHafizTasks({ plan, pageReviewData, weaknessMap, perfectRevisions, pace, targetPages, allMemorizedPages, todayStr, today, isOffDay });
  }
}

/**
 * Generate daily tasks for beginner mode.
 */
function generateBeginnerTasks({ plan, memorizedPages, pageReviewData, weaknessMap, perfectRevisions, pace, targetPages, allMemorizedPages, todayStr, today, isOffDay }) {
  const newPagesPerDay = pace.newPagesPerDay || 1;
  const revisionPerDay = pace.revisionPagesPerDay || 5;
  const weakBudget = pace.weakPagesPerDay ?? MAX_WEAK_REINFORCEMENT_BEGINNER;

  // 1. NEW MEMORIZATION — next N unmemorized pages in sequence (skip on off days)
  const unmemorizedInPlan = targetPages.filter(p => !isPageMemorized(p, memorizedPages, perfectRevisions));

  // Check if backlog is too large — pause new memorization
  const overdue = getOverduePages(pageReviewData, todayStr);
  const pauseNew = isOffDay || overdue.length > MAX_BACKLOG_BEFORE_PAUSE;

  let newMemorizationPages = [];
  if (!pauseNew && unmemorizedInPlan.length > 0) {
    // If user has set a currentMemorizationPage, start from there
    const userStartPage = plan.currentMemorizationPage;
    if (userStartPage && unmemorizedInPlan.includes(userStartPage)) {
      const startIdx = unmemorizedInPlan.indexOf(userStartPage);
      newMemorizationPages = unmemorizedInPlan.slice(startIdx, startIdx + newPagesPerDay);
    } else {
      newMemorizationPages = unmemorizedInPlan.slice(0, newPagesPerDay);
    }
  }

  // 2. SHORT-TERM REVISION — recently memorized pages (last 7 days) with score > 0 (all memorized pages)
  const shortTermPages = getShortTermPages(pageReviewData, allMemorizedPages, todayStr, today)
    .filter(p => getPageHifzScore(p, perfectRevisions) > 0);
  const shortTermBudget = Math.min(3, Math.ceil(revisionPerDay * 0.4));
  const shortTermRevision = shortTermPages.slice(0, shortTermBudget);

  // 3. LONG-TERM REVISION — SM-2 scheduled pages with score > 0
  const longTermBudget = revisionPerDay - shortTermRevision.length;
  const longTermPages = overdue
    .filter(p => !shortTermRevision.includes(p) && getPageHifzScore(p, perfectRevisions) > 0)
    .slice(0, Math.max(0, longTermBudget));

  // Combine revision pages
  const allRevisionPages = [...new Set([...shortTermRevision, ...longTermPages])];

  // 3b. FILL — if budget remains, add memorized pages outside plan that aren't already scheduled
  if (allRevisionPages.length < revisionPerDay) {
    const scheduled = new Set(allRevisionPages);
    const fillCandidates = allMemorizedPages.filter(p =>
      !scheduled.has(p) && !newMemorizationPages.includes(p) && getPageHifzScore(p, perfectRevisions) > 0 && !pageReviewData[p]?.lastReviewDate
    );
    const fillCount = revisionPerDay - allRevisionPages.length;
    for (const p of fillCandidates.slice(0, fillCount)) {
      allRevisionPages.push(p);
    }
  }

  // 4. WEAK REINFORCEMENT — memorized pages (score >= 40) with hifz strength < 80
  const alreadyScheduled = new Set([...newMemorizationPages, ...allRevisionPages]);
  const weakPages = getWeakestPages(weaknessMap, weakBudget, [...alreadyScheduled])
    .filter(p => {
      const hifzScore = getPageHifzScore(p, perfectRevisions);
      return hifzScore >= MEMORIZED_THRESHOLD && hifzScore < STRENGTH_THRESHOLD;
    });

  return {
    newMemorization: newMemorizationPages.length > 0
      ? { pages: newMemorizationPages, completed: false, completedAt: null }
      : null,
    revision: allRevisionPages.length > 0
      ? { pages: allRevisionPages, source: 'scheduled', completed: false, completedAt: null, performance: null }
      : null,
    weakReinforcement: weakPages.length > 0
      ? { pages: weakPages, reason: 'low_hifz_strength', completed: false, completedAt: null, performance: null }
      : null,
    metadata: {
      date: todayStr,
      isOffDay: isOffDay,
      backlogSize: overdue.length,
      pausedNewMemorization: pauseNew,
      totalPages: newMemorizationPages.length + allRevisionPages.length + weakPages.length,
    },
  };
}

/**
 * Generate daily tasks for hafiz mode.
 */
function generateHafizTasks({ plan, pageReviewData, weaknessMap, perfectRevisions, pace, targetPages, allMemorizedPages, todayStr, today, isOffDay }) {
  const revisionPerDay = pace.revisionPagesPerDay || 20;
  const weakBudget = pace.weakPagesPerDay ?? MAX_WEAK_REINFORCEMENT_HAFIZ;

  // 1. CYCLE REVISION — pages due today with score > 0, sorted by overdue + sequential order
  const overduePages = getOverduePages(pageReviewData, todayStr)
    .filter(p => getPageHifzScore(p, perfectRevisions) > 0);
  let cyclePages = overduePages.slice(0, revisionPerDay);

  // If fewer due than budget, pull forward pages due tomorrow (with score > 0) from all memorized pages
  if (cyclePages.length < revisionPerDay) {
    const tomorrowStr = formatDate(addDays(today, 1));
    const tomorrowDue = getDuePages(pageReviewData, tomorrowStr, allMemorizedPages)
      .filter(p => !cyclePages.includes(p) && getPageHifzScore(p, perfectRevisions) > 0);
    const pullForwardCount = revisionPerDay - cyclePages.length;
    cyclePages = [...cyclePages, ...tomorrowDue.slice(0, pullForwardCount)];
  }

  // If still fewer than budget, pick unreviewed memorized pages with score > 0 in sequential order
  if (cyclePages.length < revisionPerDay) {
    const reviewed = new Set(cyclePages);
    const unreviewedMemorized = allMemorizedPages.filter(p => !reviewed.has(p) && !pageReviewData[p]?.lastReviewDate && getPageHifzScore(p, perfectRevisions) > 0);
    const fillCount = revisionPerDay - cyclePages.length;
    cyclePages = [...cyclePages, ...unreviewedMemorized.slice(0, fillCount)];
  }

  // 2. WEAK REINFORCEMENT — memorized pages (score >= 40) with hifz strength < 80
  const alreadyScheduled = new Set(cyclePages);
  const weakPages = getWeakestPages(weaknessMap, weakBudget, [...alreadyScheduled])
    .filter(p => {
      const hifzScore = getPageHifzScore(p, perfectRevisions);
      return hifzScore >= MEMORIZED_THRESHOLD && hifzScore < STRENGTH_THRESHOLD;
    });

  return {
    newMemorization: null,
    revision: cyclePages.length > 0
      ? { pages: cyclePages, source: 'scheduled', completed: false, completedAt: null, performance: null }
      : null,
    weakReinforcement: weakPages.length > 0
      ? { pages: weakPages, reason: 'low_hifz_strength', completed: false, completedAt: null, performance: null }
      : null,
    metadata: {
      date: todayStr,
      isOffDay: isOffDay,
      backlogSize: overduePages.length,
      pausedNewMemorization: false,
      totalPages: cyclePages.length + weakPages.length,
    },
  };
}

/**
 * Generate daily tasks for mixed mode.
 * Pages in beginner-mode juz follow beginner logic; pages in hafiz-mode juz follow hafiz logic.
 * Results are merged into a single task set.
 */
function generateMixedTasks({ plan, memorizedPages, pageReviewData, weaknessMap, perfectRevisions, pace, targetPages, allMemorizedPages, todayStr, today, isOffDay }) {
  const juzModes = plan.juzModes || {};
  const layout = plan.layout || 'qpc';

  // Split pages by mode
  const beginnerPages = targetPages.filter(p => getPageMode(p, juzModes, layout) === 'beginner');
  const hafizPages = targetPages.filter(p => getPageMode(p, juzModes, layout) === 'hafiz');

  // Budget allocation: proportional to page counts
  const total = targetPages.length || 1;
  const beginnerRatio = beginnerPages.length / total;
  const hafizRatio = hafizPages.length / total;

  const newPagesPerDay = pace.newPagesPerDay || 1;
  const revisionPerDay = pace.revisionPagesPerDay || 10;
  const beginnerRevBudget = Math.max(1, Math.round(revisionPerDay * beginnerRatio));
  const hafizRevBudget = Math.max(1, revisionPerDay - beginnerRevBudget);

  // --- Beginner portion ---
  const unmemorizedBeginner = beginnerPages.filter(p => !isPageMemorized(p, memorizedPages, perfectRevisions));
  const overdueBeginner = getOverduePages(pageReviewData, todayStr).filter(p => beginnerPages.includes(p));
  const pauseNew = isOffDay || overdueBeginner.length > MAX_BACKLOG_BEFORE_PAUSE;

  let newMemorizationPages = [];
  if (!pauseNew && unmemorizedBeginner.length > 0) {
    // If user has set a currentMemorizationPage, start from there
    const userStartPage = plan.currentMemorizationPage;
    if (userStartPage && unmemorizedBeginner.includes(userStartPage)) {
      const startIdx = unmemorizedBeginner.indexOf(userStartPage);
      newMemorizationPages = unmemorizedBeginner.slice(startIdx, startIdx + newPagesPerDay);
    } else {
      newMemorizationPages = unmemorizedBeginner.slice(0, newPagesPerDay);
    }
  }

  const shortTermBeginner = getShortTermPages(pageReviewData, allMemorizedPages, todayStr, today)
    .filter(p => getPageHifzScore(p, perfectRevisions) > 0);
  const stBudget = Math.min(2, Math.ceil(beginnerRevBudget * 0.4));
  const shortTermRev = shortTermBeginner.slice(0, stBudget);
  const ltBudget = beginnerRevBudget - shortTermRev.length;
  const longTermBeginner = overdueBeginner
    .filter(p => !shortTermRev.includes(p) && getPageHifzScore(p, perfectRevisions) > 0)
    .slice(0, Math.max(0, ltBudget));
  const beginnerRevision = [...new Set([...shortTermRev, ...longTermBeginner])];

  // --- Hafiz portion --- (only pages with score > 0)
  const overdueHafiz = getOverduePages(pageReviewData, todayStr)
    .filter(p => hafizPages.includes(p) && getPageHifzScore(p, perfectRevisions) > 0);
  let hafizCyclePages = overdueHafiz.slice(0, hafizRevBudget);

  if (hafizCyclePages.length < hafizRevBudget) {
    const tomorrowStr = formatDate(addDays(today, 1));
    const tomorrowDue = getDuePages(pageReviewData, tomorrowStr, allMemorizedPages)
      .filter(p => !hafizCyclePages.includes(p) && getPageHifzScore(p, perfectRevisions) > 0);
    hafizCyclePages = [...hafizCyclePages, ...tomorrowDue.slice(0, hafizRevBudget - hafizCyclePages.length)];
  }

  if (hafizCyclePages.length < hafizRevBudget) {
    const reviewed = new Set(hafizCyclePages);
    const unreviewedMemorized = allMemorizedPages.filter(p => !reviewed.has(p) && !pageReviewData[p]?.lastReviewDate && getPageHifzScore(p, perfectRevisions) > 0);
    hafizCyclePages = [...hafizCyclePages, ...unreviewedMemorized.slice(0, hafizRevBudget - hafizCyclePages.length)];
  }

  // --- Merge revision ---
  const allRevisionPages = [...new Set([...beginnerRevision, ...hafizCyclePages])];

  // --- Fill remaining revision budget from all memorized pages ---
  if (allRevisionPages.length < revisionPerDay) {
    const scheduled = new Set([...newMemorizationPages, ...allRevisionPages]);
    const fillCandidates = allMemorizedPages.filter(p =>
      !scheduled.has(p) && getPageHifzScore(p, perfectRevisions) > 0 && !pageReviewData[p]?.lastReviewDate
    );
    const fillCount = revisionPerDay - allRevisionPages.length;
    for (const p of fillCandidates.slice(0, fillCount)) {
      allRevisionPages.push(p);
    }
  }

  // --- Weak reinforcement — memorized pages (score >= 40) with hifz strength < 80 ---
  const weakBudget = pace.weakPagesPerDay ?? (MAX_WEAK_REINFORCEMENT_BEGINNER + MAX_WEAK_REINFORCEMENT_HAFIZ);
  const alreadyScheduled = new Set([...newMemorizationPages, ...allRevisionPages]);
  const weakPages = getWeakestPages(weaknessMap, weakBudget, [...alreadyScheduled])
    .filter(p => {
      const hifzScore = getPageHifzScore(p, perfectRevisions);
      return hifzScore >= MEMORIZED_THRESHOLD && hifzScore < STRENGTH_THRESHOLD;
    });

  return {
    newMemorization: newMemorizationPages.length > 0
      ? { pages: newMemorizationPages, completed: false, completedAt: null }
      : null,
    revision: allRevisionPages.length > 0
      ? { pages: allRevisionPages, source: 'scheduled', completed: false, completedAt: null, performance: null }
      : null,
    weakReinforcement: weakPages.length > 0
      ? { pages: weakPages, reason: 'low_hifz_strength', completed: false, completedAt: null, performance: null }
      : null,
    metadata: {
      date: todayStr,
      isOffDay: isOffDay,
      backlogSize: overdueBeginner.length + overdueHafiz.length,
      pausedNewMemorization: pauseNew,
      totalPages: newMemorizationPages.length + allRevisionPages.length + weakPages.length,
      mixedMode: true,
      beginnerPageCount: beginnerPages.length,
      hafizPageCount: hafizPages.length,
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
  STRENGTH_THRESHOLD,
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
