/**
 * Murajah Calculation Utilities
 * Helper functions for statistics, progress calculations, and data transformations
 */

/**
 * Calculate memorization percentage
 * @param {number} memorized - Count of memorized pages
 * @param {number} total - Total pages
 * @returns {number} Percentage (0-100)
 */
export const calculateMemorizationPercentage = (memorized, total = 604) => {
  if (total === 0) return 0;
  return Math.round((memorized / total) * 100);
};

/**
 * Calculate Juz (Part) count from page count
 * Each Juz = 20 pages
 * @param {number} pages - Number of pages
 * @returns {number} Number of Juz
 */
export const calculateJuzCount = (pages) => {
  return Math.ceil(pages / 20);
};

/**
 * Get page number from Juz and position
 * @param {number} juzNum - Juz number (1-30)
 * @param {number} position - Position in Juz (1-20)
 * @returns {number} Page number (1-604)
 */
export const getPageFromJuz = (juzNum, position = 1) => {
  return (juzNum - 1) * 20 + Math.max(1, Math.min(20, position));
};

/**
 * Get Juz number from page
 * @param {number} pageNum - Page number (1-604)
 * @returns {number} Juz number (1-30)
 */
export const getJuzFromPage = (pageNum) => {
  return Math.ceil(pageNum / 20);
};

/**
 * Calculate remaining pages to memorize
 * @param {number} total - Total pages (604)
 * @param {number} memorized - Memorized pages
 * @returns {number} Remaining pages
 */
export const calculateRemainingPages = (memorized, total = 604) => {
  return Math.max(0, total - memorized);
};

/**
 * Estimate completion date based on pages per day
 * @param {number} remainingPages - Remaining pages
 * @param {number} pagesPerDay - Pages memorized per day
 * @param {Date} startDate - Starting date (defaults to today)
 * @returns {Date} Estimated completion date
 */
export const estimateCompletionDate = (remainingPages, pagesPerDay = 1, startDate = new Date()) => {
  if (pagesPerDay <= 0) return null;
  const daysNeeded = Math.ceil(remainingPages / pagesPerDay);
  const completionDate = new Date(startDate);
  completionDate.setDate(completionDate.getDate() + daysNeeded);
  return completionDate;
};

/**
 * Format date to readable string
 * @param {Date} date - Date to format
 * @returns {string} Formatted date (MMM DD, YYYY)
 */
export const formatDate = (date) => {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format duration in seconds to readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted time (H:MM:SS or MM:SS)
 */
export const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Get color for score (6-tier system)
 * @param {number} count - Number of perfect revisions
 * @returns {string} Tailwind color class
 */
export const getScoreColor = (count) => {
  if (count >= 6) return 'bg-green-500 text-white';      // Excellent
  if (count >= 5) return 'bg-green-400 text-white';      // Very Good
  if (count >= 4) return 'bg-yellow-400 text-gray-900';  // Good
  if (count >= 3) return 'bg-yellow-500 text-white';     // Fair
  if (count >= 1) return 'bg-orange-500 text-white';     // Poor
  return 'bg-gray-300 text-gray-700';                    // Not started
};

/**
 * Get badge color for status
 * @param {string} status - Status type (perfect, mistake, memorized, etc)
 * @returns {string} Tailwind color class
 */
export const getStatusColor = (status) => {
  const colors = {
    perfect: 'bg-green-500 text-white',
    memorized: 'bg-blue-500 text-white',
    mistake: 'bg-red-500 text-white',
    revision: 'bg-purple-500 text-white',
    progress: 'bg-yellow-500 text-gray-900',
    incomplete: 'bg-gray-300 text-gray-700'
  };
  return colors[status] || colors.incomplete;
};

/**
 * Calculate progress for progress bar
 * @param {number} current - Current value
 * @param {number} total - Total value
 * @returns {number} Percentage (0-100)
 */
export const calculateProgress = (current, total) => {
  if (total === 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
};

/**
 * Group array items by key
 * @param {Array} array - Array to group
 * @param {Function} keyFn - Function to extract group key
 * @returns {Object} Grouped object
 */
export const groupBy = (array, keyFn) => {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
};

/**
 * Sort pages by mistake count (descending), then by page number
 * @param {Map} mistakesMap - Map of { pageNum: Set<wordIds> }
 * @returns {Array} Sorted array of { pageNum, count }
 */
export const sortByMistakeCount = (mistakesMap) => {
  const pages = Array.from(mistakesMap.entries()).map(([pageNum, wordIds]) => ({
    pageNum,
    count: wordIds.size
  }));

  return pages.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count; // Descending by count
    }
    return a.pageNum - b.pageNum; // Ascending by page number
  });
};

/**
 * Generate bubble grid data for mistake tracker
 * @param {Map} mistakesMap - Map of { pageNum: Set<wordIds> }
 * @returns {Array} Array of bubble objects for grid display
 */
export const generateMistakeBubbles = (mistakesMap) => {
  const bubbles = [];
  
  for (let pageNum = 1; pageNum <= 604; pageNum++) {
    const mistakeSet = mistakesMap.get(pageNum);
    const count = mistakeSet ? mistakeSet.size : 0;
    
    bubbles.push({
      pageNum,
      count,
      color: count === 0 ? 'bg-gray-200' : 
             count === 1 ? 'bg-yellow-300' :
             count <= 3 ? 'bg-orange-400' :
             'bg-red-500'
    });
  }

  return bubbles;
};

/**
 * Create memorized grid data
 * @param {Set} memorizedSet - Set of memorized page numbers
 * @returns {Array} Array of page objects for grid display
 */
export const generateMemorizedGrid = (memorizedSet) => {
  const grid = [];
  
  for (let pageNum = 1; pageNum <= 604; pageNum++) {
    grid.push({
      pageNum,
      isMemorized: memorizedSet.has(pageNum),
      juzNum: Math.ceil(pageNum / 20),
      juzPosition: ((pageNum - 1) % 20) + 1
    });
  }

  return grid;
};

/**
 * Calculate statistics object
 * @param {Object} params - { memorized, mistakes, audios, perfectRevisions }
 * @returns {Object} Statistics object
 */
export const calculateStatistics = ({ memorized = 0, mistakes = 0, audios = 0, perfectRevisions = 0 }) => {
  const total = 604;
  const remaining = total - memorized;
  
  return {
    memorized,
    remaining,
    percentage: calculateMemorizationPercentage(memorized, total),
    juzCount: calculateJuzCount(memorized),
    mistakes,
    audios,
    perfectRevisions,
    averagePerfect: Math.round(perfectRevisions / Math.max(1, memorized)),
    totalPoints: perfectRevisions * 10 + memorized * 5 - mistakes
  };
};

/**
 * Parse page number from input
 * @param {string|number} input - User input
 * @returns {number} Valid page number (1-604) or null
 */
export const parsePageNumber = (input) => {
  const num = parseInt(input, 10);
  if (isNaN(num) || num < 1 || num > 604) {
    return null;
  }
  return num;
};

/**
 * Validate page range
 * @param {number} start - Start page
 * @param {number} end - End page
 * @returns {boolean} True if valid range
 */
export const isValidPageRange = (start, end) => {
  return start >= 1 && end <= 604 && start <= end;
};

/**
 * Generate page range array
 * @param {number} start - Start page
 * @param {number} end - End page
 * @returns {Array} Array of page numbers
 */
export const generatePageRange = (start, end) => {
  if (!isValidPageRange(start, end)) {
    return [];
  }
  
  const pages = [];
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  return pages;
};

export default {
  calculateMemorizationPercentage,
  calculateJuzCount,
  getPageFromJuz,
  getJuzFromPage,
  calculateRemainingPages,
  estimateCompletionDate,
  formatDate,
  formatDuration,
  getScoreColor,
  getStatusColor,
  calculateProgress,
  groupBy,
  sortByMistakeCount,
  generateMistakeBubbles,
  generateMemorizedGrid,
  calculateStatistics,
  parsePageNumber,
  isValidPageRange,
  generatePageRange
};
