/**
 * Murajah Calculation Utilities
 * Helper functions for statistics, progress calculations, and data transformations
 */

import { getPageHasanah } from './pageHasanah.js';

/**
 * Calculate memorization percentage
 */
export const calculateMemorizationPercentage = (memorized: number, total = 604): number => {
  if (total === 0) return 0;
  return Math.round((memorized / total) * 100);
};

/**
 * Calculate Juz (Part) count from page count. Each Juz = 20 pages.
 */
export const calculateJuzCount = (pages: number): number => {
  return Math.ceil(pages / 20);
};

/**
 * Get page number from Juz and position (position clamped to 1..20).
 */
export const getPageFromJuz = (juzNum: number, position = 1): number => {
  return (juzNum - 1) * 20 + Math.max(1, Math.min(20, position));
};

/**
 * Get Juz number from page.
 */
export const getJuzFromPage = (pageNum: number): number => {
  return Math.ceil(pageNum / 20);
};

/**
 * Calculate remaining pages to memorize.
 */
export const calculateRemainingPages = (memorized: number, total = 604): number => {
  return Math.max(0, total - memorized);
};

/**
 * Estimate completion date based on pages per day.
 */
export const estimateCompletionDate = (
  remainingPages: number,
  pagesPerDay = 1,
  startDate: Date = new Date(),
): Date | null => {
  if (pagesPerDay <= 0) return null;
  const daysNeeded = Math.ceil(remainingPages / pagesPerDay);
  const completionDate = new Date(startDate);
  completionDate.setDate(completionDate.getDate() + daysNeeded);
  return completionDate;
};

/**
 * Format date to readable string (MMM DD, YYYY).
 */
export const formatDate = (date: Date | null): string => {
  if (!date) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Format duration in seconds to readable string (H:MM:SS or MM:SS).
 */
export const formatDuration = (seconds: number | null | undefined): string => {
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
 * Get color for score (6-tier system).
 *
 * NOTE: legacy Tailwind class strings — the redesigned Progress UI colours its
 * cells with design tokens (a `--color-success` ramp), not these classes. Kept
 * for characterization/parity only; not wired into the new UI.
 */
export const getScoreColor = (count: number): string => {
  if (count >= 6) return 'bg-green-500 text-white'; // Excellent
  if (count >= 5) return 'bg-green-400 text-white'; // Very Good
  if (count >= 4) return 'bg-yellow-400 text-gray-900'; // Good
  if (count >= 3) return 'bg-yellow-500 text-white'; // Fair
  if (count >= 1) return 'bg-orange-500 text-white'; // Poor
  return 'bg-gray-300 text-gray-700'; // Not started
};

/**
 * Get badge color for status (legacy Tailwind classes — see getScoreColor note).
 */
export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    perfect: 'bg-green-500 text-white',
    memorized: 'bg-blue-500 text-white',
    mistake: 'bg-red-500 text-white',
    revision: 'bg-purple-500 text-white',
    progress: 'bg-yellow-500 text-gray-900',
    incomplete: 'bg-gray-300 text-gray-700',
  };
  return colors[status] || colors.incomplete;
};

/**
 * Calculate progress for progress bar.
 */
export const calculateProgress = (current: number, total: number): number => {
  if (total === 0) return 0;
  return Math.min(100, Math.round((current / total) * 100));
};

/**
 * Group array items by key.
 */
export const groupBy = <T>(array: T[], keyFn: (item: T) => PropertyKey): Record<string, T[]> => {
  return array.reduce<Record<string, T[]>>((groups, item) => {
    const key = String(keyFn(item));
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
};

/**
 * Sort pages by mistake count (descending), then by page number (ascending).
 */
export const sortByMistakeCount = (
  mistakesMap: Map<number, Set<unknown>>,
): { pageNum: number; count: number }[] => {
  const pages = Array.from(mistakesMap.entries()).map(([pageNum, wordIds]) => ({
    pageNum,
    count: wordIds.size,
  }));

  return pages.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count; // Descending by count
    }
    return a.pageNum - b.pageNum; // Ascending by page number
  });
};

export interface MistakeBubble {
  pageNum: number;
  count: number;
  color: string;
}

/**
 * Generate bubble grid data for mistake tracker.
 */
export const generateMistakeBubbles = (mistakesMap: Map<number, Set<unknown>>): MistakeBubble[] => {
  const bubbles: MistakeBubble[] = [];

  for (let pageNum = 1; pageNum <= 604; pageNum++) {
    const mistakeSet = mistakesMap.get(pageNum);
    const count = mistakeSet ? mistakeSet.size : 0;

    bubbles.push({
      pageNum,
      count,
      color:
        count === 0
          ? 'bg-gray-200'
          : count === 1
            ? 'bg-yellow-300'
            : count <= 3
              ? 'bg-orange-400'
              : 'bg-red-500',
    });
  }

  return bubbles;
};

export interface MemorizedGridItem {
  pageNum: number;
  isMemorized: boolean;
  juzNum: number;
  juzPosition: number;
}

/**
 * Create memorized grid data.
 */
export const generateMemorizedGrid = (memorizedSet: Set<number>): MemorizedGridItem[] => {
  const grid: MemorizedGridItem[] = [];

  for (let pageNum = 1; pageNum <= 604; pageNum++) {
    grid.push({
      pageNum,
      isMemorized: memorizedSet.has(pageNum),
      juzNum: Math.ceil(pageNum / 20),
      juzPosition: ((pageNum - 1) % 20) + 1,
    });
  }

  return grid;
};

/**
 * Calculate score for a memorized page. Formula: page_hasanah * perfect_revision_count.
 */
export const calculatePageScore = (pageNum: number, perfectRevisionCount = 0): number => {
  if (perfectRevisionCount <= 0) return 0;
  const hasanah = getPageHasanah(pageNum);
  return hasanah * perfectRevisionCount;
};

/**
 * Calculate total score from perfect revisions data.
 *
 * NOTE: legacy `Σ hasanah × perfectRevisions`. In the redesigned reward model
 * this is NO LONGER the live hasanah total (hasanah is a cumulative counter);
 * it survives only as the migration seed (see progressMigration). Not wired live.
 */
export const calculateTotalScore = (perfectRevisionsData: Record<string, number> = {}): number => {
  let total = 0;
  for (const [pageNumStr, count] of Object.entries(perfectRevisionsData)) {
    const pageNum = parseInt(pageNumStr, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= 604) {
      total += calculatePageScore(pageNum, count);
    }
  }
  return total;
};

export interface StatisticsInput {
  memorized?: number;
  mistakes?: number;
  audios?: number;
  perfectRevisions?: number;
  total?: number;
}

export interface Statistics {
  memorized: number;
  remaining: number;
  percentage: number;
  juzCount: number;
  mistakes: number;
  audios: number;
  perfectRevisions: number;
  averagePerfect: number;
  totalPoints: number;
}

/**
 * Calculate statistics object.
 */
export const calculateStatistics = ({
  memorized = 0,
  mistakes = 0,
  audios = 0,
  perfectRevisions = 0,
  total = 604,
}: StatisticsInput): Statistics => {
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
    totalPoints: perfectRevisions * 10 + memorized * 5 - mistakes,
  };
};

/**
 * Parse page number from input. Returns a valid page (1..maxPages) or null.
 */
export const parsePageNumber = (input: string | number, maxPages = 604): number | null => {
  const num = parseInt(String(input), 10);
  if (isNaN(num) || num < 1 || num > maxPages) {
    return null;
  }
  return num;
};

/**
 * Validate page range.
 */
export const isValidPageRange = (start: number, end: number, maxPages = 604): boolean => {
  return start >= 1 && end <= maxPages && start <= end;
};

/**
 * Generate page range array.
 */
export const generatePageRange = (start: number, end: number): number[] => {
  if (!isValidPageRange(start, end)) {
    return [];
  }

  const pages: number[] = [];
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
  calculatePageScore,
  calculateTotalScore,
  calculateStatistics,
  parsePageNumber,
  isValidPageRange,
  generatePageRange,
};
