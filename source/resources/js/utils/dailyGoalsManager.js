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
  const today = new Date().toISOString().split('T')[0];
  
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

  const today = new Date().toISOString().split('T')[0];
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

  let currentStreak = 0;
  let longestStreak = 0;
  let lastCompletedDate = null;

  // Sort by date (oldest first)
  const sorted = [...dailyGoalHistory].sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );

  // Helper function: Check if ALL tasks in a goal are complete
  const isGoalComplete = (dayGoal) => {
    const tasks = Object.values(dayGoal.tasks);
    if (tasks.length === 0) return false;
    return tasks.every(task => task.completed === true);
  };

  // Count streak from oldest to newest
  for (let i = 0; i < sorted.length; i++) {
    const dayGoal = sorted[i];
    
    if (isGoalComplete(dayGoal)) {
      currentStreak++;
      lastCompletedDate = dayGoal.date;
    } 
  }

  // Check if streak continues from yesterday to today
  // If the most recent completed day is NOT yesterday, the streak is broken
  if (sorted.length > 0) {
    const lastDateStr = sorted[sorted.length - 1].date;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Calculate yesterday's date
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    
    const isYesterday = lastDateStr === yesterdayStr;
    const isToday = lastDateStr === todayStr;

    // Streak continues ONLY if:
    // 1. Last completed day is yesterday (streak will continue into today even if today incomplete)
    // 2. Last completed day is today (user completed today's goals)
    // Otherwise, there's a gap and streak breaks
    if (!isYesterday && !isToday) {
      Logger.debug(Logger.MODULES.DAILY_GOALS, 'Streak broken - gap detected', {
        lastCompletion: lastDateStr,
        yesterday: yesterdayStr,
        today: todayStr,
        streak: currentStreak
      });
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
      currentStreak = 0;
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    lastCompletedDate
  };
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
  const today = new Date().toISOString().split('T')[0];
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
    tasksCounts,
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
