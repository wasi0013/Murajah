/**
 * Murajah Unified Data Loader Utility
 * Handles loading and parsing Quran data for both QPC (604 pages) and Indopak (610 pages) layouts
 * Resources are cached to IndexedDB for better performance
 * Now integrates with ResourceCache for unified caching
 */

import Logger from './logger.js';
import { getResourceCache } from './resourceCache.js';

// Layout-specific resource configurations
const LAYOUT_CONFIGS = {
  qpc: {
    layout: {
      key: 'layout',
      cacheId: 'qpc-v2-15-lines',
      url: './resources/data/quran/qpc-v2-15-lines.json'
    },
    words: {
      key: 'words',
      cacheId: 'qpc-v2-word-by-word',
      url: './resources/data/quran/qpc-v2-word-by-word.json'
    },
    tafsirMapping: {
      key: 'tafsirMapping',
      cacheId: 'qpc-page-tafsir-mapping',
      url: './resources/data/tafsir/qpc-page-tafsir-mapping.json'
    },
    totalPages: 604,
    fontFamily: "'QPCV2Page', 'Traditional Arabic', 'Arial Unicode MS', sans-serif",
    lineHeight: 1.6,
    letterSpacing: '0.1em',
    tajweedSupported: true
  },
  indopak: {
    layout: {
      key: 'layout',
      cacheId: 'indopak-15-lines',
      url: './resources/data/quran/indopak-15-lines.json'
    },
    words: {
      key: 'words',
      cacheId: 'indopak-nastaleeq',
      url: './resources/data/indopak/indopak-nastaleeq.json'
    },
    tafsirMapping: {
      key: 'tafsirMapping',
      cacheId: 'indopak-page-tafsir-mapping',
      url: './resources/data/tafsir/indopak-page-tafsir-mapping.json'
    },
    totalPages: 610,
    fontFamily: "'IndopakNastaleeq', 'Traditional Arabic', 'Arial Unicode MS', sans-serif",
    lineHeight: 2.2,
    letterSpacing: '0.05em',
    tajweedSupported: false
  }
};

// Shared resources (same for both layouts)
const SHARED_CONFIGS = {
  surahNames: {
    key: 'surahNames',
    cacheId: 'quran-surah-names',
    url: './resources/data/quran/surah-names.json'
  },
  translations: {
    key: 'translations',
    cacheId: 'english-wbw-translation',
    url: './resources/data/quran/english-wbw-translation.json'
  },
  tafsirBn: {
    key: 'tafsirBn',
    cacheId: 'bn-tafsir',
    url: './resources/data/tafsir/bn-tafsir.json'
  },
  tafsirEn: {
    key: 'tafsirEn',
    cacheId: 'en-tafsir',
    url: './resources/data/tafsir/en-tafsir.json'
  }
};

// Separate caches for each layout to allow quick switching
const dataCaches = {
  qpc: {
    layout: null,
    words: null,
    tafsirMapping: null,
    isLoaded: false
  },
  indopak: {
    layout: null,
    words: null,
    tafsirMapping: null,
    isLoaded: false
  },
  shared: {
    surahNames: null,
    translations: null,
    tafsirBn: null,
    tafsirEn: null,
    isLoaded: false
  }
};

const resourceRefreshState = {};

/**
 * Fetch resource from network and cache to IndexedDB
 */
const fetchAndCacheResource = async (resourceConfig, murajahDB) => {
  const response = await fetch(resourceConfig.url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${resourceConfig.key} (${response.status})`);
  }

  const data = await response.json();
  
  // Cache to IndexedDB (skip very large files >5MB to avoid quota issues)
  if (murajahDB) {
    try {
      const dataSize = JSON.stringify(data).length;
      if (dataSize < 5000000) {
        const cacheRecord = {
          id: resourceConfig.cacheId,
          resourceKey: resourceConfig.key,
          url: resourceConfig.url,
          data,
          updatedAt: new Date().toISOString(),
          etag: response.headers.get('etag'),
          lastModified: response.headers.get('last-modified')
        };
        await murajahDB.saveCachedResource(cacheRecord);
        Logger.debug(Logger.MODULES.DATA, `Cached ${resourceConfig.key} (${(dataSize/1024).toFixed(1)}KB)`);
      } else {
        Logger.debug(Logger.MODULES.DATA, `Skipping cache for ${resourceConfig.key} - too large (${(dataSize/1024/1024).toFixed(2)}MB)`);
      }
    } catch (cacheError) {
      Logger.warn(Logger.MODULES.DATA, `Failed to cache ${resourceConfig.key}`, cacheError);
    }
  }

  return data;
};

/**
 * Schedule background refresh of cached resource
 */
const scheduleResourceRefresh = (resourceConfig, murajahDB, onBackgroundUpdate, cacheTarget, cacheKey) => {
  if (!resourceConfig) return;

  const refreshKey = `${resourceConfig.key}-${resourceConfig.cacheId}`;
  if (resourceRefreshState[refreshKey]) return;

  resourceRefreshState[refreshKey] = true;
  setTimeout(async () => {
    try {
      const freshData = await fetchAndCacheResource(resourceConfig, murajahDB);
      if (cacheTarget && cacheKey) {
        cacheTarget[cacheKey] = freshData;
      }
      Logger.info(Logger.MODULES.DATA, `Background refresh: ${resourceConfig.key}`);
      if (typeof onBackgroundUpdate === 'function') {
        onBackgroundUpdate(resourceConfig.key, freshData, { source: 'background' });
      }
    } catch (error) {
      Logger.warn(Logger.MODULES.DATA, `Background refresh failed for ${resourceConfig.key}`, error);
    } finally {
      resourceRefreshState[refreshKey] = false;
    }
  }, 100);
};

/**
 * Load resource with cache-first strategy
 */
const loadResourceWithCache = async ({ resourceConfig, murajahDB, onBackgroundUpdate, cacheTarget, cacheKey }) => {
  if (!resourceConfig) {
    throw new Error('[Murajah] Resource configuration is required');
  }

  // Use ResourceCache for static Quran data (increments cache hits)
  const resourceCache = getResourceCache();
  if (resourceCache) {
    try {
      const data = await resourceCache.loadWithCache(resourceConfig.cacheId, resourceConfig.url, 'json');
      scheduleResourceRefresh(resourceConfig, murajahDB, onBackgroundUpdate, cacheTarget, cacheKey);
      return data;
    } catch (error) {
      Logger.warn(Logger.MODULES.DATA, `Failed to load ${resourceConfig.key}`, error);
      // Fallback to direct fetch
      const response = await fetch(resourceConfig.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${resourceConfig.url}`);
      }
      const data = await response.json();
      scheduleResourceRefresh(resourceConfig, murajahDB, onBackgroundUpdate, cacheTarget, cacheKey);
      return data;
    }
  }

  // Fallback if no resourceCache
  throw new Error('[Murajah] ResourceCache not available');
};

/**
 * Load shared resources (surahNames, translations, tafsir)
 */
const loadSharedResources = async ({ murajahDB, onBackgroundUpdate }) => {
  if (dataCaches.shared.isLoaded) {
    return {
      surahNames: dataCaches.shared.surahNames,
      translations: dataCaches.shared.translations,
      tafsirBn: dataCaches.shared.tafsirBn,
      tafsirEn: dataCaches.shared.tafsirEn
    };
  }

  const [surahNamesData, translationsData, tafsirBnData, tafsirEnData] = await Promise.all([
    loadResourceWithCache({ 
      resourceConfig: SHARED_CONFIGS.surahNames, 
      murajahDB, 
      onBackgroundUpdate,
      cacheTarget: dataCaches.shared,
      cacheKey: 'surahNames'
    }),
    loadResourceWithCache({ 
      resourceConfig: SHARED_CONFIGS.translations, 
      murajahDB, 
      onBackgroundUpdate,
      cacheTarget: dataCaches.shared,
      cacheKey: 'translations'
    }),
    loadResourceWithCache({ 
      resourceConfig: SHARED_CONFIGS.tafsirBn, 
      murajahDB, 
      onBackgroundUpdate,
      cacheTarget: dataCaches.shared,
      cacheKey: 'tafsirBn'
    }),
    loadResourceWithCache({ 
      resourceConfig: SHARED_CONFIGS.tafsirEn, 
      murajahDB, 
      onBackgroundUpdate,
      cacheTarget: dataCaches.shared,
      cacheKey: 'tafsirEn'
    })
  ]);

  dataCaches.shared.surahNames = surahNamesData;
  dataCaches.shared.translations = translationsData;
  dataCaches.shared.tafsirBn = tafsirBnData;
  dataCaches.shared.tafsirEn = tafsirEnData;
  dataCaches.shared.isLoaded = true;

  return {
    surahNames: surahNamesData,
    translations: translationsData,
    tafsirBn: tafsirBnData,
    tafsirEn: tafsirEnData
  };
};

/**
 * Load all Quran data for a specific layout
 * @param {string} layout - 'qpc' or 'indopak'
 * @param {Object} options - { murajahDB, onTranslationUpdate, onResourceUpdate }
 * @returns {Promise<Object>} Combined data object
 */
export const loadAllQuranData = async (layout = 'qpc', { murajahDB, onTranslationUpdate, onResourceUpdate } = {}) => {
  const layoutConfig = LAYOUT_CONFIGS[layout];
  if (!layoutConfig) {
    throw new Error(`[Murajah] Unknown layout: ${layout}`);
  }

  const cache = dataCaches[layout];
  
  const handleBackgroundUpdate = (resourceKey, freshData, meta = {}) => {
    if (resourceKey === 'translations' && typeof onTranslationUpdate === 'function') {
      onTranslationUpdate(freshData, meta);
    }
    if (typeof onResourceUpdate === 'function') {
      onResourceUpdate({ key: resourceKey, data: freshData, layout, ...meta });
    }
  };

  // Return cached data if already loaded
  if (cache.isLoaded && dataCaches.shared.isLoaded) {
    Logger.debug(Logger.MODULES.DATA, `Returning cached ${layout} Quran data`);
    return {
      layout: cache.layout,
      words: cache.words,
      surahNames: dataCaches.shared.surahNames,
      translations: dataCaches.shared.translations,
      tafsirBn: dataCaches.shared.tafsirBn,
      tafsirEn: dataCaches.shared.tafsirEn,
      tafsirMapping: cache.tafsirMapping,
      pageLines: [],
      layoutConfig
    };
  }

  try {
    Logger.info(Logger.MODULES.DATA, `Loading ${layout} Quran data files...`);
    const startTime = performance.now();

    // Load layout-specific and shared resources in parallel
    const [layoutData, wordsData, tafsirMappingData, sharedData] = await Promise.all([
      loadResourceWithCache({ 
        resourceConfig: layoutConfig.layout, 
        murajahDB, 
        onBackgroundUpdate: handleBackgroundUpdate,
        cacheTarget: cache,
        cacheKey: 'layout'
      }),
      loadResourceWithCache({ 
        resourceConfig: layoutConfig.words, 
        murajahDB, 
        onBackgroundUpdate: handleBackgroundUpdate,
        cacheTarget: cache,
        cacheKey: 'words'
      }),
      loadResourceWithCache({ 
        resourceConfig: layoutConfig.tafsirMapping, 
        murajahDB, 
        onBackgroundUpdate: handleBackgroundUpdate,
        cacheTarget: cache,
        cacheKey: 'tafsirMapping'
      }),
      loadSharedResources({ murajahDB, onBackgroundUpdate: handleBackgroundUpdate })
    ]);

    cache.layout = layoutData;
    cache.words = wordsData;
    cache.tafsirMapping = tafsirMappingData;
    cache.isLoaded = true;

    const duration = performance.now() - startTime;
    Logger.info(Logger.MODULES.DATA, `${layout} Quran data loaded`, {
      duration: `${duration.toFixed(2)}ms`,
      pages: layoutData.pages?.length || 0,
      words: Object.keys(wordsData).length
    });

    return {
      layout: layoutData,
      words: wordsData,
      surahNames: sharedData.surahNames,
      translations: sharedData.translations,
      tafsirBn: sharedData.tafsirBn,
      tafsirEn: sharedData.tafsirEn,
      tafsirMapping: tafsirMappingData,
      pageLines: [],
      layoutConfig
    };
  } catch (error) {
    Logger.error(Logger.MODULES.DATA, `Failed to load ${layout} Quran data`, error);
    throw error;
  }
};

/**
 * Get layout configuration
 * @param {string} layout - 'qpc' or 'indopak'
 * @returns {Object} Layout configuration
 */
export const getLayoutConfig = (layout = 'qpc') => {
  return LAYOUT_CONFIGS[layout] || LAYOUT_CONFIGS.qpc;
};

/**
 * Get text for a specific page
 * @param {number} pageNum - Page number
 * @param {Object} layoutData - Layout data with pages array
 * @param {Object} wordsData - Words data object
 * @returns {Array} Array of text for the page
 */
export const getPageText = (pageNum, layoutData, wordsData) => {
  if (!layoutData || !layoutData.pages || !wordsData) {
    Logger.warn(Logger.MODULES.DATA, `Missing data for page ${pageNum}`);
    return [];
  }

  try {
    // Create word ID lookup for fast access
    const wordById = {};
    Object.values(wordsData).forEach(word => {
      if (word && word.id) {
        wordById[word.id] = word;
      }
    });

    // Find all lines for this page
    const lines = layoutData.pages.filter(line => line.page_number === pageNum);
    
    const pageText = lines.map(line => {
      if (line.line_type === 'surah_name' && line.surah_number) {
        return `📖 Surah ${line.surah_number}`;
      }
      
      if (line.first_word_id && line.last_word_id) {
        const words = [];
        for (let wid = parseInt(line.first_word_id); wid <= parseInt(line.last_word_id); wid++) {
          const wordEntry = wordById[wid];
          if (wordEntry && wordEntry.text) {
            words.push(wordEntry.text);
          }
        }
        return words.join(' ');
      }
      return '';
    }).filter(text => text.length > 0);
    
    return pageText;
  } catch (error) {
    Logger.error(Logger.MODULES.DATA, `Error loading page text for page ${pageNum}`, error);
    return [];
  }
};

/**
 * Get page lines from layout data
 * @param {number} pageNum - Page number
 * @param {Array} layoutData - Layout data array
 * @returns {Array} Array of surah data for the page
 */
export const getPageLines = (pageNum, layoutData) => {
  if (!layoutData || !Array.isArray(layoutData)) {
    return [];
  }
  
  if (pageNum < 1 || pageNum > layoutData.length) {
    return [];
  }

  return layoutData[pageNum - 1] || [];
};

/**
 * Get page text with word-by-word breakdown
 * @param {number} pageNum - Page number
 * @param {Object} layoutData - Layout data with pages array
 * @param {Object} wordsData - Words data object
 * @returns {Array} Array of line objects with word arrays
 */
export const getPageWordsDetailed = (pageNum, layoutData, wordsData) => {
  if (!layoutData || !layoutData.pages || !wordsData) {
    Logger.warn(Logger.MODULES.DATA, `Missing data for page ${pageNum} detailed words`);
    return [];
  }

  try {
    // Create word ID lookup for fast access
    const wordById = {};
    Object.values(wordsData).forEach(word => {
      if (word && word.id) {
        wordById[word.id] = word;
      }
    });

    // Find all lines for this page
    const lines = layoutData.pages.filter(line => line.page_number === pageNum);
    
    const pageWords = lines.map(line => {
      if (line.line_type === 'surah_name' && line.surah_number) {
        return {
          type: 'surah_name',
          text: `Surah ${line.surah_number}`,
          words: []
        };
      }
      
      if (line.first_word_id && line.last_word_id) {
        const words = [];
        for (let wid = parseInt(line.first_word_id); wid <= parseInt(line.last_word_id); wid++) {
          const wordEntry = wordById[wid];
          if (wordEntry && wordEntry.text) {
            words.push({
              id: wid,
              text: wordEntry.text,
              surah: wordEntry.surah,
              ayah: wordEntry.ayah,
              position: wordEntry.position,
              word: wordEntry.word,
              lineIndex: line.line_number
            });
          }
        }
        
        return {
          type: 'ayah',
          lineNumber: line.line_number,
          words: words
        };
      }
      
      return {
        type: 'empty',
        words: []
      };
    }).filter(line => line.words.length > 0 || line.type === 'surah_name');
    
    return pageWords;
  } catch (error) {
    Logger.error(Logger.MODULES.DATA, `Error loading detailed words for page ${pageNum}`, error);
    return [];
  }
};

/**
 * Get surah name by number
 * @param {number} surahNum - Surah number (1-114)
 * @param {Object|Array} surahNamesData - Surah names data
 * @returns {string} Surah name in Arabic
 */
export const getSurahName = (surahNum, surahNamesData) => {
  if (Array.isArray(surahNamesData)) {
    return surahNamesData[surahNum - 1]?.name || `Surah ${surahNum}`;
  }
  
  if (typeof surahNamesData === 'object') {
    return surahNamesData[surahNum]?.name || `Surah ${surahNum}`;
  }
  
  return `Surah ${surahNum}`;
};

/**
 * Get word translation by ayah key
 * @param {string} ayahKey - Key in format "surah:ayah:word"
 * @param {Object} translationsData - Translations data object
 * @returns {string} Word translation or empty string
 */
export const getWordTranslation = (ayahKey, translationsData) => {
  if (!translationsData || !translationsData[ayahKey]) {
    return '';
  }
  return translationsData[ayahKey].translation || '';
};

/**
 * Clear cache for a specific layout or all caches
 * @param {string} layout - 'qpc', 'indopak', 'shared', or 'all'
 */
export const clearDataCache = (layout = 'all') => {
  const clearCache = (cache) => {
    Object.keys(cache).forEach(key => {
      if (key !== 'isLoaded') {
        cache[key] = null;
      }
    });
    cache.isLoaded = false;
  };

  if (layout === 'all') {
    clearCache(dataCaches.qpc);
    clearCache(dataCaches.indopak);
    clearCache(dataCaches.shared);
  } else if (dataCaches[layout]) {
    clearCache(dataCaches[layout]);
  }

  Object.keys(resourceRefreshState).forEach(key => {
    resourceRefreshState[key] = false;
  });
  
  Logger.info(Logger.MODULES.DATA, `Data cache cleared: ${layout}`);
};

/**
 * Check if data is cached for a layout
 * @param {string} layout - 'qpc' or 'indopak'
 * @returns {boolean}
 */
export const isDataCached = (layout = 'qpc') => {
  return dataCaches[layout]?.isLoaded && dataCaches.shared.isLoaded;
};

/**
 * Preload a layout in the background (for faster switching)
 * @param {string} layout - 'qpc' or 'indopak'
 * @param {Object} murajahDB - Database instance
 */
export const preloadLayout = async (layout, murajahDB) => {
  if (dataCaches[layout]?.isLoaded) {
    return; // Already loaded
  }
  
  try {
    Logger.info(Logger.MODULES.DATA, `Preloading ${layout} layout in background...`);
    await loadAllQuranData(layout, { murajahDB });
    Logger.info(Logger.MODULES.DATA, `${layout} layout preloaded`);
  } catch (error) {
    Logger.warn(Logger.MODULES.DATA, `Failed to preload ${layout} layout`, error);
  }
};
