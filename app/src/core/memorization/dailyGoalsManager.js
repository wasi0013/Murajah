/**
 * Daily Goals Manager
 * Handles task initialization, streak calculation, and review range rotation
 * Simple, maintainable utility functions
 */

import Logger from './logger.js';

/**
 * Initialize today's goals based on user settings and memorized pages
 * @param {Object} settings - User settings (selectedTasks, finishRevisionDays, pagesPerDay)
 * @param {Set} memorizedPages - Set of memorized page numbers
 * @param {Object} lastDailyGoal - Previous day's goal record (for rotation tracking)
 * @returns {Object} Today's goal object
 */
export function initializeTodayGoals(settings, memorizedPages, lastDailyGoal) {
  const today = getTodayDate();
  
  const todayGoal = {
    date: today,
    tasks: {},
    completedCount: 0,
    lastUpdated: new Date().toISOString(),
    rotationIndex: 0, // Track rotation index at goal level for next day's calculation
    chunkNumber: 1,
    totalChunks: 1
  };

  // Only include tasks selected by user, in the correct order
  const selectedTasks = settings.selectedTasks || ['reciteAyahs', 'recordRandomPage', 'reviewRange', 'memorizeDaily'];
  
  // Define the task order (this is the authoritative order)
  const taskOrder = ['reciteAyahs', 'recordRandomPage', 'reviewRange', 'memorizeDaily'];

  // Create tasks in the correct order
  for (const taskName of taskOrder) {
    if (!selectedTasks.includes(taskName)) {
      continue; // Skip if user didn't select this task
    }

    if (taskName === 'reciteAyahs') {
      todayGoal.tasks.reciteAyahs = {
        name: 'Recite 10 verses',
        description: 'Recite 10 ayahs from the quran.',
        completed: false,
        completedAt: null
      };
    }

    if (taskName === 'recordRandomPage') {
      todayGoal.tasks.recordRandomPage = {
        name: 'Do a quick test',
        description: 'Recite and record a random memorized page from memory and check mistakes.',
        completed: false,
        completedAt: null,
        recordingId: null
      };
    }

    if (taskName === 'reviewRange') {
      const reviewRange = calculateReviewRange(
        Array.from(memorizedPages).sort((a, b) => a - b),
        settings.finishRevisionDays || 30,
        lastDailyGoal
      );
      todayGoal.tasks.reviewRange = {
        name: 'Recite from memory',
        description: `Revise these pages today: ${reviewRange.pages.join(', ')}`,
        completed: false,
        completedAt: null,
        startPage: reviewRange.startPage,
        endPage: reviewRange.endPage,
        pages: reviewRange.pages
      };
      
      // Store rotation info at goal level for next day's calculation
      todayGoal.rotationIndex = reviewRange.rotationIndex;
      todayGoal.chunkNumber = reviewRange.chunkNumber;
      todayGoal.totalChunks = reviewRange.totalChunks;
    }

    if (taskName === 'memorizeDaily') {
      const targetPages = settings.pagesPerDay || 1;
      Logger.debug(Logger.MODULES.DAILY_GOALS, 'Creating memorizeDaily task', { 
        pagesPerDay: settings.pagesPerDay, 
        targetPages 
      });
      todayGoal.tasks.memorizeDaily = {
        name: 'Memorize new',
        description: `Complete your daily memorization target.`,
        completed: false,
        completedAt: null,
        targetPages: targetPages,
        pagesAddedToday: 0
      };
    }
  }

  return todayGoal;
}

/**
 * Merge plan-generated tasks into existing daily goals.
 * Call after initializeTodayGoals when an active plan exists.
 * Plan tasks appear alongside standard tasks without replacing them.
 * @param {Object} todayGoal - The daily goal object from initializeTodayGoals
 * @param {Object|null} planGoals - Output of planTasksToDailyGoals (keyed task map), or null
 * @returns {Object} The mutated todayGoal with plan tasks merged in
 */
export function mergePlanTasks(todayGoal, planGoals) {
  if (!planGoals || !todayGoal) return todayGoal;

  for (const [key, task] of Object.entries(planGoals)) {
    if (!todayGoal.tasks[key]) {
      todayGoal.tasks[key] = task;
    }
  }
  return todayGoal;
}

/**
 * Calculate review range for today based on rotation
 * Divides memorized pages into chunks based on finishRevisionDays and rotates through them
 * Fair distribution: if remainder exists, first chunks get +1 page
 * @param {Array} sortedMemorisedPages - Sorted array of memorized page numbers
 * @param {number} finishRevisionDays - Days to complete one full cycle (determines number of chunks)
 * @param {Object} lastDailyGoal - Last day's goal to get rotation index
 * @returns {Object} { startPage, endPage, pages: [], rotationIndex, chunkNumber, totalChunks }
 */
export function calculateReviewRange(sortedMemorisedPages, finishRevisionDays, lastDailyGoal) {
  if (!sortedMemorisedPages || sortedMemorisedPages.length === 0) {
    return { startPage: 0, endPage: 0, pages: [], rotationIndex: 0, chunkNumber: 1, totalChunks: 1 };
  }

  const today = getTodayDate();
  const lastDate = lastDailyGoal?.date;

  // Total number of chunks = finishRevisionDays (each chunk represents one day's review)
  const totalPages = sortedMemorisedPages.length;
  const totalChunks = finishRevisionDays;
  
  // Fair distribution: base chunk size + distribute remainder to first chunks
  const baseChunkSize = Math.floor(totalPages / totalChunks);
  const remainder = totalPages % totalChunks;
  
  // Helper function to get chunk size for a given chunk index
  const getChunkSize = (chunkIdx) => {
    return chunkIdx < remainder ? baseChunkSize + 1 : baseChunkSize;
  };

  // Get current rotation index
  let rotationIndex = 0;

  if (lastDate && lastDate !== today) {
    // Get last rotation index and increment to next chunk
    const lastRotationIndex = lastDailyGoal?.rotationIndex !== undefined ? lastDailyGoal.rotationIndex : 0;
    // Rotate to next chunk, wrapping around if we exceed totalChunks
    rotationIndex = (lastRotationIndex + 1) % totalChunks;
    
    Logger.debug(Logger.MODULES.DAILY_GOALS, 'Rotation logic (new day)', {
      lastDate,
      today,
      lastRotationIndex,
      newRotationIndex: rotationIndex,
      totalChunks,
      totalPages,
      baseChunkSize,
      remainder
    });
  } else {
    Logger.debug(Logger.MODULES.DAILY_GOALS, 'First time or same day - starting at chunk 0');
  }

  // Calculate start index by summing sizes of all previous chunks
  let startIdx = 0;
  for (let i = 0; i < rotationIndex; i++) {
    startIdx += getChunkSize(i);
  }
  
  const currentChunkSize = getChunkSize(rotationIndex);
  const endIdx = Math.min(startIdx + currentChunkSize, totalPages);
  const pagesForReview = sortedMemorisedPages.slice(startIdx, endIdx);

  Logger.debug(Logger.MODULES.DAILY_GOALS, 'Review range calculated', {
    rotationIndex,
    chunkNumber: `${rotationIndex + 1}/${totalChunks}`,
    chunkSize: currentChunkSize,
    pagesCount: pagesForReview.length
  });

  return {
    startPage: pagesForReview[0] || 0,
    endPage: pagesForReview[pagesForReview.length - 1] || 0,
    pages: pagesForReview,
    rotationIndex: rotationIndex,
    chunkNumber: rotationIndex + 1,
    totalChunks: totalChunks
  };
}

/**
 * Mark a task as completed
 * @param {Object} todayGoal - Today's goal object
 * @param {string} taskName - Name of task to complete
 * @param {Object} metadata - Additional metadata (e.g., recordingId, pagesAdded)
 * @returns {Object} Updated goal object
 */
export function completeTask(todayGoal, taskName, metadata = {}) {
  if (!todayGoal.tasks[taskName]) {
    Logger.warn(Logger.MODULES.DAILY_GOALS, `Task '${taskName}' not found`);
    return todayGoal;
  }

  const task = todayGoal.tasks[taskName];
  task.completed = true;
  task.completedAt = new Date().toISOString();

  // Store metadata if provided
  if (metadata.recordingId) {
    task.recordingId = metadata.recordingId;
  }
  if (metadata.pagesAdded !== undefined) {
    task.pagesAddedToday = metadata.pagesAdded;
  }

  // Update completed count
  todayGoal.completedCount = Object.values(todayGoal.tasks).filter(t => t.completed).length;
  todayGoal.lastUpdated = new Date().toISOString();

  Logger.debug(Logger.MODULES.DAILY_GOALS, `Task completed: '${taskName}'`);

  return todayGoal;
}

/**
 * Undo task completion (mark as incomplete)
 * @param {Object} todayGoal - Today's goal object
 * @param {string} taskName - Name of task to undo
 * @returns {Object} Updated goal object
 */
export function uncompleteTask(todayGoal, taskName) {
  if (!todayGoal.tasks[taskName]) {
    Logger.warn(Logger.MODULES.DAILY_GOALS, `Task '${taskName}' not found`);
    return todayGoal;
  }

  const task = todayGoal.tasks[taskName];
  task.completed = false;
  task.completedAt = null;

  // Update completed count
  todayGoal.completedCount = Object.values(todayGoal.tasks).filter(t => t.completed).length;
  todayGoal.lastUpdated = new Date().toISOString();

  Logger.debug(Logger.MODULES.DAILY_GOALS, `Task uncompleted: '${taskName}'`);

  return todayGoal;
}

/**
 * Calculate current streak based on daily goal history
 * Only counts days where selected tasks were completed
 * Breaks immediately if a day has 0 tasks completed
 * @param {Array} dailyGoalHistory - Array of daily goal records sorted by date (oldest first)
 * @param {Array} selectedTasks - List of selected tasks for streak
 * @returns {Object} { currentStreak, longestStreak, lastCompletedDate }
 */
export function calculateStreak(dailyGoalHistory, selectedTasks) {
  if (!dailyGoalHistory || dailyGoalHistory.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastCompletedDate: null };
  }

  // Helper: format Date -> YYYY-MM-DD
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (dateStr, delta) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return fmt(d);
  };

  // Create a set of completed dates for O(1) lookup
  const completedDates = new Set();
  let lastCompletedDate = null;

  // Sort by date (oldest first)
  const sorted = [...dailyGoalHistory].sort((a, b) => new Date(a.date) - new Date(b.date));

  const isGoalComplete = (dayGoal) => {
    const tasks = Object.values(dayGoal.tasks);
    if (tasks.length === 0) return false;
    return tasks.every((t) => t.completed === true);
  };

  for (const dayGoal of sorted) {
    if (isGoalComplete(dayGoal)) {
      completedDates.add(dayGoal.date);
      lastCompletedDate = dayGoal.date;
    }
  }

  // Compute current streak: count consecutive completed days ending at anchor date
  // Anchor is today if today is complete; otherwise anchor is yesterday
  const today = new Date();
  const todayStr = fmt(today);
  const yesterdayStr = addDays(todayStr, -1);

  const todayComplete = completedDates.has(todayStr);
  let anchor = todayComplete ? todayStr : yesterdayStr;

  // If yesterday wasn't complete and today isn't complete, streak must be 0 (matches expectation)
  // If yesterday wasn't complete but today is complete, typical logic would return 1.
  // The product requirement says: if previous day wasn't complete, streak resets to 0.
  // We'll implement: non-zero streak requires yesterday to be complete unless today itself is the first day.
  // To match the example precisely, if yesterday is incomplete, return 0 regardless of today.
  if (!completedDates.has(yesterdayStr)) {
    Logger.debug(Logger.MODULES.DAILY_GOALS, 'Streak reset: previous day incomplete', { yesterdayStr });
    return { currentStreak: 0, longestStreak: computeLongestStreak(completedDates), lastCompletedDate };
  }

  let currentStreak = 0;
  while (completedDates.has(anchor)) {
    currentStreak += 1;
    anchor = addDays(anchor, -1);
  }

  return {
    currentStreak,
    longestStreak: computeLongestStreak(completedDates),
    lastCompletedDate,
  };
}

// Compute the longest streak across all completed dates
function computeLongestStreak(completedDatesSet) {
  if (!completedDatesSet || completedDatesSet.size === 0) return 0;

  // Convert set to sorted array
  const dates = Array.from(completedDatesSet).sort((a, b) => new Date(a) - new Date(b));

  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (dateStr, delta) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return fmt(d);
  };

  let longest = 0;
  let current = 0;
  let prev = null;
  for (const dateStr of dates) {
    if (!prev || dateStr === addDays(prev, 1)) {
      current += 1;
    } else {
      longest = Math.max(longest, current);
      current = 1;
    }
    prev = dateStr;
  }
  longest = Math.max(longest, current);
  return longest;
}

/**
 * Check if all available tasks are completed for today
 * @param {Object} todayGoal - Today's goal object
 * @returns {boolean}
 */
export function checkAllTasksComplete(todayGoal) {
  const taskValues = Object.values(todayGoal.tasks);
  if (taskValues.length === 0) return false;
  return taskValues.every(task => task.completed);
}

/**
 * Get task count for today
 * @param {Object} todayGoal - Today's goal object
 * @returns {Object} { total, completed }
 */
export function getTaskCounts(todayGoal) {
  const total = Object.keys(todayGoal.tasks).length;
  const completed = Object.values(todayGoal.tasks).filter(t => t.completed).length;
  return { total, completed };
}

/**
 * Check if today is a new day (different from provided date)
 * @param {string} lastDate - Last known date in ISO format (YYYY-MM-DD)
 * @returns {boolean}
 */
export function isNewDay(lastDate) {
  if (!lastDate) return true;
  const today = getTodayDate();
  return today !== lastDate;
}

/**
 * Get today's date in ISO format
 * @returns {string} YYYY-MM-DD
 */
export function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate completion percentage for a given day
 * @param {Object} dailyGoal - Daily goal record
 * @returns {number} 0-100
 */
export function getCompletionPercentage(dailyGoal) {
  const tasks = Object.values(dailyGoal.tasks);
  if (tasks.length === 0) return 0;
  const completed = tasks.filter(t => t.completed).length;
  return Math.round((completed / tasks.length) * 100);
}

/**
 * Generate a summary for a specific date's goals
 * @param {Object} dailyGoal - Daily goal record
 * @returns {Object} Summary with date, completion %, streak info
 */
export function generateDaySummary(dailyGoal) {
  const completionPercentage = getCompletionPercentage(dailyGoal);
  const taskCounts = getTaskCounts(dailyGoal);

  return {
    date: dailyGoal.date,
    completionPercentage,
    taskCounts,
    completedAllTasks: completionPercentage === 100,
    completedAt: dailyGoal.completedAt || null,
    tasks: dailyGoal.tasks
  };
}

export default {
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
};
