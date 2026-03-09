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
  },
  tafsirAr: {
    key: 'tafsirAr',
    cacheId: 'ar-tafsir',
    url: './resources/data/tafsir/ar-tafsir.json'
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
    tafsirAr: null,
    isLoaded: false
  }
};

const resourceRefreshState = {};

// Cached wordById lookup maps to avoid O(n) rebuilds per page render
const wordByIdCache = {
  qpc: null,
  indopak: null,
  _wordsDataRef: { qpc: null, indopak: null }
};

/**
 * Get or build a cached wordById lookup map
 * Only rebuilds when the underlying wordsData reference changes
 */
const getWordByIdLookup = (wordsData, layout = 'qpc') => {
  // Return cached map if wordsData reference hasn't changed
  if (wordByIdCache[layout] && wordByIdCache._wordsDataRef[layout] === wordsData) {
    return wordByIdCache[layout];
  }
  
  // Build new lookup map
  const wordById = {};
  if (wordsData) {
    const values = Object.values(wordsData);
    for (let i = 0; i < values.length; i++) {
      const word = values[i];
      if (word && word.id) {
        wordById[word.id] = word;
      }
    }
  }
  
  // Cache it
  wordByIdCache[layout] = wordById;
  wordByIdCache._wordsDataRef[layout] = wordsData;
  Logger.debug(Logger.MODULES.DATA, `Built wordById lookup for ${layout}: ${Object.keys(wordById).length} words`);
  return wordById;
};

/**
 * Fetch resource from network and cache to IndexedDB
 */
const fetchAndCacheResource = async (resourceConfig, murajahDB) => {
  const response = await fetch(resourceConfig.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${resourceConfig.key} (${response.status})`);
  }

  const data = await response.json();
  
  // Cache to IndexedDB (use rough size estimation instead of expensive JSON.stringify)
  if (murajahDB) {
    try {
      const estimatedSize = typeof data === 'object' ? Object.keys(data).length * 200 : 0;
      if (estimatedSize < 5000000) {
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
        Logger.debug(Logger.MODULES.DATA, `Cached ${resourceConfig.key} (~${(estimatedSize/1024).toFixed(1)}KB est)`);
      } else {
        Logger.debug(Logger.MODULES.DATA, `Skipping cache for ${resourceConfig.key} - too large (~${(estimatedSize/1024/1024).toFixed(2)}MB est)`);
      }
    } catch (cacheError) {
      Logger.warn(Logger.MODULES.DATA, `Failed to cache ${resourceConfig.key}`, cacheError);
    }
  }

  return data;
};

/**
 * Schedule background refresh of cached resource
 * Only refreshes after a significant delay to avoid competing with initial load
 */
const scheduleResourceRefresh = (resourceConfig, murajahDB, onBackgroundUpdate, cacheTarget, cacheKey) => {
  if (!resourceConfig) return;

  const refreshKey = `${resourceConfig.key}-${resourceConfig.cacheId}`;
  if (resourceRefreshState[refreshKey]) return;

  resourceRefreshState[refreshKey] = true;
  // Delay background refresh significantly to avoid competing with initial load (30s instead of 100ms)
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
  }, 30000);
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
 * Load shared resources (surahNames, translations)
 * Tafsir resources are loaded lazily when needed
 */
const loadSharedResources = async ({ murajahDB, onBackgroundUpdate, onTafsirUpdate }) => {
  if (dataCaches.shared.isLoaded) {
    return {
      surahNames: dataCaches.shared.surahNames,
      translations: dataCaches.shared.translations,
      tafsirBn: dataCaches.shared.tafsirBn,
      tafsirEn: dataCaches.shared.tafsirEn,
      tafsirAr: dataCaches.shared.tafsirAr
    };
  }

  // Only load critical resources for initial render (surahNames + translations)
  // Tafsir files are large and only needed when user opens tafsir view
  const [surahNamesData, translationsData] = await Promise.all([
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
    })
  ]);

  dataCaches.shared.surahNames = surahNamesData;
  dataCaches.shared.translations = translationsData;
  dataCaches.shared.isLoaded = true;

  // Defer tafsir loading to idle time (large files not needed for initial render)
  const loadTafsirLazy = async () => {
    try {
      const [tafsirBnData, tafsirEnData, tafsirArData] = await Promise.all([
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
        }),
        loadResourceWithCache({ 
          resourceConfig: SHARED_CONFIGS.tafsirAr, 
          murajahDB, 
          onBackgroundUpdate,
          cacheTarget: dataCaches.shared,
          cacheKey: 'tafsirAr'
        })
      ]);
      dataCaches.shared.tafsirBn = tafsirBnData;
      dataCaches.shared.tafsirEn = tafsirEnData;
      dataCaches.shared.tafsirAr = tafsirArData;
      Logger.info(Logger.MODULES.DATA, 'Tafsir data loaded (deferred)');
      if (typeof onTafsirUpdate === 'function') {
        onTafsirUpdate({ tafsirBn: tafsirBnData, tafsirEn: tafsirEnData, tafsirAr: tafsirArData });
      }
    } catch (error) {
      Logger.warn(Logger.MODULES.DATA, 'Failed to load tafsir data (deferred)', error);
    }
  };

  // Use requestIdleCallback if available, otherwise setTimeout with long delay
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => loadTafsirLazy(), { timeout: 10000 });
  } else {
    setTimeout(loadTafsirLazy, 5000);
  }

  return {
    surahNames: surahNamesData,
    translations: translationsData,
    tafsirBn: null,
    tafsirEn: null,
    tafsirAr: null
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
      tafsirAr: dataCaches.shared.tafsirAr,
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
      loadSharedResources({ murajahDB, onBackgroundUpdate: handleBackgroundUpdate, onTafsirUpdate: (tafsirData) => {
        if (typeof onResourceUpdate === 'function') {
          onResourceUpdate({ key: 'tafsir', data: tafsirData, layout });
        }
      }})
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
      tafsirAr: sharedData.tafsirAr,
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
    // Use cached word ID lookup for fast access (avoids O(n) rebuild per call)
    const wordById = getWordByIdLookup(wordsData);

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
    // Use cached word ID lookup for fast access (avoids O(n) rebuild per call)
    const wordById = getWordByIdLookup(wordsData);

    // Find all lines for this page
    const lines = layoutData.pages.filter(line => line.page_number === pageNum);
    
    const pageWords = lines.map(line => {
      if (line.line_type === 'surah_name' && line.surah_number) {
        return {
          type: 'surah_name',
          surah: line.surah_number,
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
    // Clear wordById caches
    wordByIdCache.qpc = null;
    wordByIdCache.indopak = null;
    wordByIdCache._wordsDataRef.qpc = null;
    wordByIdCache._wordsDataRef.indopak = null;
  } else if (dataCaches[layout]) {
    clearCache(dataCaches[layout]);
    // Clear wordById cache for this layout
    if (wordByIdCache[layout]) {
      wordByIdCache[layout] = null;
      wordByIdCache._wordsDataRef[layout] = null;
    }
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
