/**
 * Murajah Morphology Loader Utility
 * Lazy loads morphology data by Surah to keep memory usage low
 * 
 * Key format in JSON: "surah:ayah:word" (e.g., "1:1:1" = first word of Fatiha)
 */

import Logger from './logger.js';

// In-memory cache for loaded surah morphology data
const morphologyCache = new Map();

// Track loading promises to prevent duplicate requests
const loadingPromises = new Map();

/**
 * Load morphology data for a specific Surah
 * @param {number} surahNum - Surah number (1-114)
 * @returns {Promise<Object>} Morphology data object keyed by "surah:ayah:word"
 */
export const loadMorphologyForSurah = async (surahNum) => {
  // Validate surah number
  if (surahNum < 1 || surahNum > 114) {
    Logger.warn(Logger.MODULES.DATA, `Invalid surah number: ${surahNum}`);
    return {};
  }

  // Return from cache if available
  if (morphologyCache.has(surahNum)) {
    Logger.debug(Logger.MODULES.DATA, `Morphology for Surah ${surahNum} served from cache`);
    return morphologyCache.get(surahNum);
  }

  // If already loading, wait for existing promise
  if (loadingPromises.has(surahNum)) {
    Logger.debug(Logger.MODULES.DATA, `Waiting for existing load of Surah ${surahNum} morphology`);
    return loadingPromises.get(surahNum);
  }

  // Create loading promise
  const loadPromise = (async () => {
    try {
      const startTime = performance.now();
      Logger.info(Logger.MODULES.DATA, `Loading morphology for Surah ${surahNum}...`);

      const response = await fetch(`./resources/data/morphology/${surahNum}.json`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to load morphology for Surah ${surahNum}`);
      }

      const json = await response.json();
      const data = json.data || {};

      // Cache the data
      morphologyCache.set(surahNum, data);

      const duration = performance.now() - startTime;
      const wordCount = Object.keys(data).length;
      Logger.info(Logger.MODULES.DATA, `Morphology for Surah ${surahNum} loaded`, {
        duration: `${duration.toFixed(2)}ms`,
        words: wordCount
      });

      return data;
    } catch (error) {
      Logger.error(Logger.MODULES.DATA, `Failed to load morphology for Surah ${surahNum}`, error);
      return {};
    } finally {
      // Clear loading promise
      loadingPromises.delete(surahNum);
    }
  })();

  loadingPromises.set(surahNum, loadPromise);
  return loadPromise;
};

/**
 * Get morphology for a specific word
 * @param {number} surahNum - Surah number (1-114)
 * @param {number} ayahNum - Ayah number
 * @param {number} wordNum - Word position in ayah (1-based)
 * @returns {Promise<string|null>} Morphology HTML string or null
 */
export const getMorphologyForWord = async (surahNum, ayahNum, wordNum) => {
  const data = await loadMorphologyForSurah(surahNum);
  const key = `${surahNum}:${ayahNum}:${wordNum}`;
  return data[key] || null;
};

/**
 * Get morphology for multiple words at once (batch load)
 * Useful for loading all morphology for a page
 * @param {Array<{surah: number, ayah: number, word: number}>} wordRefs - Array of word references
 * @returns {Promise<Map<string, string>>} Map of "surah:ayah:word" -> morphology HTML
 */
export const getMorphologyForWords = async (wordRefs) => {
  // Group by surah for efficient loading
  const surahGroups = new Map();
  wordRefs.forEach(ref => {
    const surah = ref.surah;
    if (!surahGroups.has(surah)) {
      surahGroups.set(surah, []);
    }
    surahGroups.set(surah, [...surahGroups.get(surah), ref]);
  });

  // Load all needed surahs in parallel
  const surahNums = Array.from(surahGroups.keys());
  await Promise.all(surahNums.map(s => loadMorphologyForSurah(s)));

  // Build result map
  const result = new Map();
  for (const ref of wordRefs) {
    const key = `${ref.surah}:${ref.ayah}:${ref.word}`;
    const data = morphologyCache.get(ref.surah);
    if (data && data[key]) {
      result.set(key, data[key]);
    }
  }

  return result;
};

/**
 * Preload morphology for surahs appearing on a specific page
 * @param {number} pageNum - Page number (1-604)
 * @param {Object} layoutData - Quran layout data
 * @param {Object} wordsData - Quran words data
 * @returns {Promise<Set<number>>} Set of preloaded surah numbers
 */
export const preloadMorphologyForPage = async (pageNum, layoutData, wordsData) => {
  if (!layoutData?.pages || !wordsData) {
    return new Set();
  }

  // Find all surahs on this page
  const surahsOnPage = new Set();
  const lines = layoutData.pages.filter(line => line.page_number === pageNum);
  
  for (const line of lines) {
    if (line.first_word_id && line.last_word_id) {
      for (let wid = parseInt(line.first_word_id); wid <= parseInt(line.last_word_id); wid++) {
        const word = Object.values(wordsData).find(w => w.id === wid);
        if (word?.surah) {
          surahsOnPage.add(word.surah);
        }
      }
    }
  }

  // Preload all surahs on page in parallel
  await Promise.all(Array.from(surahsOnPage).map(s => loadMorphologyForSurah(s)));
  
  Logger.debug(Logger.MODULES.DATA, `Preloaded morphology for surahs on page ${pageNum}:`, Array.from(surahsOnPage));
  return surahsOnPage;
};

/**
 * Check if morphology is cached for a surah
 * @param {number} surahNum - Surah number
 * @returns {boolean}
 */
export const isSurahMorphologyCached = (surahNum) => {
  return morphologyCache.has(surahNum);
};

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
export const getMorphologyCacheStats = () => {
  let totalWords = 0;
  morphologyCache.forEach(data => {
    totalWords += Object.keys(data).length;
  });

  return {
    cachedSurahs: morphologyCache.size,
    totalCachedWords: totalWords,
    cachedSurahNumbers: Array.from(morphologyCache.keys())
  };
};

/**
 * Clear morphology cache (useful for memory management)
 * @param {number} [surahNum] - Specific surah to clear, or all if not provided
 */
export const clearMorphologyCache = (surahNum) => {
  if (typeof surahNum === 'number') {
    morphologyCache.delete(surahNum);
    Logger.debug(Logger.MODULES.DATA, `Cleared morphology cache for Surah ${surahNum}`);
  } else {
    morphologyCache.clear();
    Logger.debug(Logger.MODULES.DATA, 'Cleared all morphology cache');
  }
};

export default {
  loadMorphologyForSurah,
  getMorphologyForWord,
  getMorphologyForWords,
  preloadMorphologyForPage,
  isSurahMorphologyCached,
  getMorphologyCacheStats,
  clearMorphologyCache
};
