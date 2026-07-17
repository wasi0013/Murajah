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

/**
 * A collection keyed by page number, accepted as either a Map or a plain object
 * (legacy duck-typing). Read-only so a `Map<number, Set<string>>` etc. assigns in.
 */
type MapLike<V> = ReadonlyMap<number, V> | Record<number, V>

/** Anything we can count the entries of — a Set (`.size`) or an array (`.length`). */
type Countable = { readonly size: number } | { readonly length: number }

/** Read a page-keyed value from either a Map or a plain object. */
function readPage<V>(coll: MapLike<V> | undefined, page: number): V | undefined {
  if (!coll) return undefined
  return coll instanceof Map ? coll.get(page) : (coll as Record<number, V>)[page]
}

/** Count entries of a mistake collection, whether a Set or an array. */
function countMistakes(x: Countable | undefined): number {
  if (!x) return 0
  return 'size' in x ? x.size : x.length
}

export interface PageReviewData {
  lastReviewDate?: string
  reviewCount?: number
}

const WEIGHTS = {
  RECENCY: 0.3,
  REVISION_QUALITY: 0.25,
  MISTAKES: 0.2,
  QUIZ_ACCURACY: 0.15,
  LOW_REVIEW_COUNT: 0.1,
};

// Days after which recency factor is maxed out
const RECENCY_CAP_DAYS = 30;

// Review count below which a penalty applies
const LOW_REVIEW_THRESHOLD = 3;

// Average words per Quran page (approximate, for normalization)
const AVG_WORDS_PER_PAGE = 128;

export interface PageWeaknessParams {
  daysSinceLastReview?: number
  perfectRevisionCount?: number
  totalReviewCount?: number
  mistakeCount?: number
  totalWordsOnPage?: number
  quizAccuracy?: number | null
}

/**
 * Calculate weakness score for a single page.
 * @returns Weakness score 0-100 (integer). 0=very strong, 100=very weak.
 */
export function calculatePageWeakness({
  daysSinceLastReview = 0,
  perfectRevisionCount = 0,
  totalReviewCount = 0,
  mistakeCount = 0,
  totalWordsOnPage = AVG_WORDS_PER_PAGE,
  quizAccuracy = null,
}: PageWeaknessParams = {}): number {
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
  const quizFactor =
    quizAccuracy !== null && quizAccuracy !== undefined
      ? 1 - Math.max(0, Math.min(1, quizAccuracy))
      : 0.5; // Default: neutral when no quiz data

  // Factor 5: Low review count penalty (penalize pages with < 3 reviews)
  const lowReviewPenalty =
    reviews < LOW_REVIEW_THRESHOLD ? (LOW_REVIEW_THRESHOLD - reviews) / LOW_REVIEW_THRESHOLD : 0;

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

export interface AllWeaknessesParams {
  pages?: number[]
  perfectRevisions?: MapLike<number>
  mistakesMap?: MapLike<Countable>
  pageReviewData?: MapLike<PageReviewData>
  quizScores?: MapLike<number>
  today?: Date
}

/**
 * Calculate weakness scores for all pages in a given set.
 * @returns Map<pageNum, weaknessScore 0-100>
 */
export function calculateAllWeaknesses({
  pages,
  perfectRevisions = new Map<number, number>(),
  mistakesMap = new Map<number, Set<unknown>>(),
  pageReviewData = {},
  quizScores = {},
  today = new Date(),
}: AllWeaknessesParams = {}): Map<number, number> {
  if (!pages || pages.length === 0) {
    return new Map();
  }

  const todayTime = today.getTime();
  const MS_PER_DAY = 86400000;
  const results = new Map<number, number>();

  for (const pageNum of pages) {
    const reviewData = readPage(pageReviewData, pageNum) ?? {};
    const lastReviewStr = reviewData.lastReviewDate;

    let daysSinceLastReview = RECENCY_CAP_DAYS; // Default: cap (never reviewed)
    if (lastReviewStr) {
      const lastReviewTime = new Date(lastReviewStr + 'T00:00:00').getTime();
      if (!isNaN(lastReviewTime)) {
        daysSinceLastReview = Math.floor((todayTime - lastReviewTime) / MS_PER_DAY);
      }
    }

    const perfectCount = readPage(perfectRevisions, pageNum) ?? 0;
    const mistakeCount = countMistakes(readPage(mistakesMap, pageNum));
    const quizAccuracy = readPage(quizScores, pageNum) ?? null;

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
 * @returns Array of page numbers, weakest first
 */
export function getWeakestPages(
  weaknessMap: Map<number, number>,
  n: number,
  excludePages: number[] = [],
): number[] {
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
