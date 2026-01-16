/**
 * Murajah Morphology Store
 * Reactive store for morphology data state and UI
 */

import { reactive, ref, computed } from 'vue';
import * as morphologyLoader from '../utils/morphologyLoader.js';

// Reactive store state
export const morphologyStore = reactive({
  // Currently displayed morphology (for popup/panel)
  currentMorphology: null,
  // The word reference that's currently selected (e.g., {surah: 1, ayah: 1, word: 1, text: 'بِسْمِ'})
  selectedWord: null,
  // Loading state
  isLoading: false,
  // Error state
  error: null,
  // Whether morphology popup is visible
  isPopupVisible: false,
  // Popup position (for floating popup)
  popupPosition: { x: 0, y: 0 }
});

/**
 * Load and display morphology for a specific word
 * @param {Object} wordInfo - Word info with surah, ayah, word (1-based position), text
 * @returns {Promise<void>}
 */
export const showMorphologyForWord = async (wordInfo) => {
  if (!wordInfo || !wordInfo.surah || !wordInfo.ayah || !wordInfo.word) {
    console.warn('[Murajah] Invalid word info for morphology:', wordInfo);
    return;
  }

  morphologyStore.isLoading = true;
  morphologyStore.error = null;
  morphologyStore.selectedWord = wordInfo;
  morphologyStore.isPopupVisible = true;

  try {
    const morphology = await morphologyLoader.getMorphologyForWord(
      wordInfo.surah,
      wordInfo.ayah,
      wordInfo.word
    );

    morphologyStore.currentMorphology = morphology;
    
    if (!morphology) {
      morphologyStore.error = 'No morphology data available for this word';
    }
  } catch (error) {
    console.error('[Murajah] Failed to load morphology:', error);
    morphologyStore.error = 'Failed to load morphology data';
    morphologyStore.currentMorphology = null;
  } finally {
    morphologyStore.isLoading = false;
  }
};

/**
 * Hide morphology popup
 */
export const hideMorphologyPopup = () => {
  morphologyStore.isPopupVisible = false;
  morphologyStore.selectedWord = null;
  morphologyStore.currentMorphology = null;
  morphologyStore.error = null;
};

/**
 * Update popup position (for mouse-following popup)
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
export const updatePopupPosition = (x, y) => {
  morphologyStore.popupPosition = { x, y };
};

/**
 * Preload morphology for a page (call this when navigating to improve UX)
 * @param {number} pageNum - Page number
 * @param {Object} layoutData - Quran layout data
 * @param {Object} wordsData - Quran words data
 */
export const preloadPageMorphology = async (pageNum, layoutData, wordsData) => {
  try {
    await morphologyLoader.preloadMorphologyForPage(pageNum, layoutData, wordsData);
  } catch (error) {
    console.warn('[Murajah] Failed to preload page morphology:', error);
  }
};

/**
 * Get cache statistics
 * @returns {Object}
 */
export const getMorphologyCacheStats = () => {
  return morphologyLoader.getMorphologyCacheStats();
};

/**
 * Clear morphology cache
 */
export const clearMorphologyCache = () => {
  morphologyLoader.clearMorphologyCache();
};

export default {
  morphologyStore,
  showMorphologyForWord,
  hideMorphologyPopup,
  updatePopupPosition,
  preloadPageMorphology,
  getMorphologyCacheStats,
  clearMorphologyCache
};
