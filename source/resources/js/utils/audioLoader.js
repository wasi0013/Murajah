/**
 * Audio Loader Utility
 * Handles loading and managing Quran audio URLs
 */

/**
 * Get audio URL for a specific verse (ayah)
 * @param {number} surah - Surah number (1-114)
 * @param {number} ayah - Ayah number
 * @returns {Object} Object with primary and fallback URLs
 */
export const getVerseAudioUrl = (surah, ayah) => {
  const surahPadded = String(surah).padStart(3, '0');
  const ayahPadded = String(ayah).padStart(3, '0');

  return {
    primary: `https://the-quran-project.github.io/Quran-Audio/Data/1/${surah}_${ayah}.mp3`,
    fallback: `https://everyayah.com/data/Alafasy_128kbps/${surahPadded}${ayahPadded}.mp3`
  };
};

/**
 * Get all verses (ayahs) on a specific page from quran.json data
 * @param {number} pageNum - Page number (1-604)
 * @param {Object|Array} quranData - Quran data (can be object with surah keys or flat array)
 * @returns {Array} Array of verses with surah and ayah info
 */
export const getPageVerses = (pageNum, quranData) => {
  if (!quranData) {
    console.warn(`[Murajah] Missing quran data for page ${pageNum}`);
    return [];
  }

  let allVerses = [];
  
  // quran.json is structured as an object with surah numbers as keys
  // e.g., { "1": [{chapter, verse, page, text}, ...], "2": [...], ... }
  if (Array.isArray(quranData)) {
    allVerses = quranData;
  } else if (typeof quranData === 'object') {
    Object.values(quranData).forEach(surahVerses => {
      if (Array.isArray(surahVerses)) {
        allVerses.push(...surahVerses);
      }
    });
  }

  if (allVerses.length === 0) {
    return [];
  }

  // Filter all verses on this page and sort by surah and ayah
  const verses = allVerses
    .filter(verse => verse && verse.page === pageNum)
    .sort((a, b) => {
      if (a.chapter !== b.chapter) {
        return a.chapter - b.chapter;
      }
      return a.verse - b.verse;
    });

  return verses;
};

/**
 * Preload audio for verses to reduce delay when playing
 * @param {Array} urls - Array of audio URLs to preload
 */
export const preloadAudio = (urls) => {
  urls.forEach(url => {
    const audio = new Audio();
    audio.src = url;
    audio.preload = 'metadata';
  });
};

/**
 * Test audio URL and return working one (primary or fallback)
 * @param {string} primaryUrl - Primary URL to test
 * @param {string} fallbackUrl - Fallback URL if primary fails
 * @returns {Promise<string>} Promise that resolves to working URL
 */
export const getWorkingAudioUrl = async (primaryUrl, fallbackUrl) => {
  try {
    const response = await fetch(primaryUrl, { method: 'HEAD', mode: 'no-cors' });
    // For no-cors requests, we check status (0 is ok for no-cors)
    if (response.ok || response.status === 0) {
      return primaryUrl;
    }
  } catch (error) {
    console.debug('[Murajah] Primary audio URL failed, trying fallback:', error);
  }

  return fallbackUrl;
};
