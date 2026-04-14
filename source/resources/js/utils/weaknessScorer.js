/**
 * Weakness Scorer
 * Calculates a composite weakness score (0-100) for each memorized page.
 * Higher score = weaker retention, needs more review.
 *
 * SCORE FORMULA:
 *   weakness = w1 * recencyFactor
 *            + w2 * (1 - perfectRevisionRatio)
 *            + w3 * mistakeRatio
 *            + w4 * (1 - quizAccuracy)
 *            + w5 * lowReviewCountPenalty
 *
 * WEIGHTS:
 *   w1 = 0.30  (recency — forgetting curve is the biggest factor)
 *   w2 = 0.25  (revision quality — perfect revisions indicate mastery)
 *   w3 = 0.20  (mistakes — word-level errors reveal weak spots)
 *   w4 = 0.15  (quiz performance — independent verification)
 *   w5 = 0.10  (review count — new pages with few reviews are risky)
 */

import Logger from './logger.js';

const WEIGHTS = {
  RECENCY: 0.30,
  REVISION_QUALITY: 0.25,
  MISTAKES: 0.20,
  QUIZ_ACCURACY: 0.15,
  LOW_REVIEW_COUNT: 0.10,
};

// Days after which recency factor is maxed out
const RECENCY_CAP_DAYS = 30;

// Review count below which a penalty applies
const LOW_REVIEW_THRESHOLD = 3;

// Average words per Quran page (approximate, for normalization)
const AVG_WORDS_PER_PAGE = 128;

/**
 * Calculate weakness score for a single page.
 *
 * @param {Object} params
 * @param {number} params.daysSinceLastReview - Days since the page was last reviewed (0 = today)
 * @param {number} params.perfectRevisionCount - Number of perfect revisions (from perfectRevisions Map)
 * @param {number} params.totalReviewCount - Total times the page has been reviewed
 * @param {number} params.mistakeCount - Number of distinct words with mistakes on this page
 * @param {number} params.totalWordsOnPage - Total words on this page (for normalization)
 * @param {number} [params.quizAccuracy] - Quiz accuracy for this page's ayahs (0-1, null if no quiz data)
 * @returns {number} Weakness score 0-100 (integer). 0=very strong, 100=very weak.
 */
export function calculatePageWeakness({
  daysSinceLastReview = 0,
  perfectRevisionCount = 0,
  totalReviewCount = 0,
  mistakeCount = 0,
  totalWordsOnPage = AVG_WORDS_PER_PAGE,
  quizAccuracy = null,
} = {}) {
  // Clamp inputs to valid ranges
  const days = Math.max(0, daysSinceLastReview);
  const perfect = Math.max(0, perfectRevisionCount);
  const reviews = Math.max(0, totalReviewCount);
  const mistakes = Math.max(0, mistakeCount);
  const words = Math.max(1, totalWordsOnPage);

  // Factor 1: Recency (0=reviewed today, 1=30+ days ago)
  const recencyFactor = Math.min(days / RECENCY_CAP_DAYS, 1.0);

  // Factor 2: Revision quality (0=all perfect, 1=no perfect revisions)
  const perfectRatio = reviews > 0 ? Math.min(perfect / reviews, 1.0) : 0;
  const revisionQualityFactor = 1 - perfectRatio;

  // Factor 3: Mistake ratio (0=no mistakes, 1=all words have mistakes)
  const mistakeRatio = Math.min(mistakes / words, 1.0);

  // Factor 4: Quiz accuracy (0=perfect quiz, 1=failed quiz, 0.5=no data)
  const quizFactor = quizAccuracy !== null && quizAccuracy !== undefined
    ? 1 - Math.max(0, Math.min(1, quizAccuracy))
    : 0.5; // Default: neutral when no quiz data

  // Factor 5: Low review count penalty (penalize pages with < 3 reviews)
  const lowReviewPenalty = reviews < LOW_REVIEW_THRESHOLD
    ? (LOW_REVIEW_THRESHOLD - reviews) / LOW_REVIEW_THRESHOLD
    : 0;

  // Weighted sum
  const rawScore =
    WEIGHTS.RECENCY * recencyFactor +
    WEIGHTS.REVISION_QUALITY * revisionQualityFactor +
    WEIGHTS.MISTAKES * mistakeRatio +
    WEIGHTS.QUIZ_ACCURACY * quizFactor +
    WEIGHTS.LOW_REVIEW_COUNT * lowReviewPenalty;

  // Scale to 0-100 and clamp
  const score = Math.round(Math.max(0, Math.min(100, rawScore * 100)));

  return score;
}

/**
 * Calculate weakness scores for all pages in a given set.
 *
 * @param {Object} params
 * @param {number[]} params.pages - Array of page numbers to score
 * @param {Map<number, number>} params.perfectRevisions - Map<pageNum, perfectCount>
 * @param {Map<number, Set>} params.mistakesMap - Map<pageNum, Set<wordId>>
 * @param {Object} params.pageReviewData - Map/Object of pageNum → { lastReviewDate, reviewCount }
 * @param {Object} [params.quizScores] - Map/Object of pageNum → accuracy (0-1)
 * @param {Date} [params.today] - Override today's date (for testing)
 * @returns {Map<number, number>} Map<pageNum, weaknessScore 0-100>
 */
export function calculateAllWeaknesses({
  pages,
  perfectRevisions = new Map(),
  mistakesMap = new Map(),
  pageReviewData = {},
  quizScores = {},
  today = new Date(),
} = {}) {
  if (!pages || pages.length === 0) {
    return new Map();
  }

  const todayTime = today.getTime();
  const MS_PER_DAY = 86400000;
  const results = new Map();

  for (const pageNum of pages) {
    const reviewData = pageReviewData[pageNum] || pageReviewData.get?.(pageNum) || {};
    const lastReviewStr = reviewData.lastReviewDate;

    let daysSinceLastReview = RECENCY_CAP_DAYS; // Default: cap (never reviewed)
    if (lastReviewStr) {
      const lastReviewTime = new Date(lastReviewStr + 'T00:00:00').getTime();
      if (!isNaN(lastReviewTime)) {
        daysSinceLastReview = Math.floor((todayTime - lastReviewTime) / MS_PER_DAY);
      }
    }

    const perfectCount = perfectRevisions.get?.(pageNum) ?? perfectRevisions[pageNum] ?? 0;
    const mistakeSet = mistakesMap.get?.(pageNum) ?? mistakesMap[pageNum];
    const mistakeCount = mistakeSet ? (mistakeSet.size ?? mistakeSet.length ?? 0) : 0;

    const quizAccuracy = quizScores[pageNum] ?? quizScores.get?.(pageNum) ?? null;

    const score = calculatePageWeakness({
      daysSinceLastReview,
      perfectRevisionCount: perfectCount,
      totalReviewCount: reviewData.reviewCount ?? 0,
      mistakeCount,
      totalWordsOnPage: AVG_WORDS_PER_PAGE,
      quizAccuracy,
    });

    results.set(pageNum, score);
  }

  Logger.debug(Logger.MODULES.PLAN, 'Weakness scores calculated', {
    pageCount: pages.length,
    avgScore: Math.round([...results.values()].reduce((a, b) => a + b, 0) / results.size),
  });

  return results;
}

/**
 * Get the top N weakest pages sorted by weakness score descending.
 *
 * @param {Map<number, number>} weaknessMap - Map<pageNum, score>
 * @param {number} n - Number of pages to return
 * @param {number[]} [excludePages] - Pages to exclude (e.g., already in today's tasks)
 * @returns {number[]} Array of page numbers, weakest first
 */
export function getWeakestPages(weaknessMap, n, excludePages = []) {
  if (!weaknessMap || weaknessMap.size === 0 || n <= 0) {
    return [];
  }

  const excludeSet = new Set(excludePages);

  return [...weaknessMap.entries()]
    .filter(([page]) => !excludeSet.has(page))
    .sort((a, b) => b[1] - a[1]) // Descending by score
    .slice(0, n)
    .map(([page]) => page);
}

// Export constants for testing
export { WEIGHTS, RECENCY_CAP_DAYS, LOW_REVIEW_THRESHOLD, AVG_WORDS_PER_PAGE };

export default {
  calculatePageWeakness,
  calculateAllWeaknesses,
  getWeakestPages,
};
