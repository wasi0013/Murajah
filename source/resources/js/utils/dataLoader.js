/**
 * Murajah Data Loader Utility
 * Handles loading and parsing all Quran data from JSON files
 */

import Logger from './logger.js';

const RESOURCE_CONFIGS = {
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
  surahNames: {
    key: 'surahNames',
    cacheId: 'quran-surah-names',
    url: './resources/data/quran/surah-names.json'
  },
  translations: {
    key: 'translations',
    cacheId: 'english-wbw-translation',
    url: './resources/data/quran/english-wbw-translation.json'
  }
};

const dataCache = {
  layout: null,
  words: null,
  surahNames: null,
  translations: null,
  isLoaded: false
};

const resourceRefreshState = {};

const fetchAndCacheResource = async (resourceConfig, murajahDB) => {
  const response = await fetch(resourceConfig.url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${resourceConfig.key} (${response.status})`);
  }

  const data = await response.json();
  const cacheRecord = {
    id: resourceConfig.cacheId,
    resourceKey: resourceConfig.key,
    url: resourceConfig.url,
    data,
    updatedAt: new Date().toISOString(),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified')
  };

  if (murajahDB) {
    try {
      await murajahDB.saveCachedResource(cacheRecord);
    } catch (cacheError) {
      Logger.warn(Logger.MODULES.DATA, `Failed to cache ${resourceConfig.key}`, cacheError);
    }
  }

  return data;
};

const scheduleResourceRefresh = (resourceConfig, murajahDB, onBackgroundUpdate) => {
  if (!resourceConfig) {
    return;
  }

  const { key } = resourceConfig;
  if (resourceRefreshState[key]) {
    return;
  }

  resourceRefreshState[key] = true;
  setTimeout(async () => {
    try {
      const freshData = await fetchAndCacheResource(resourceConfig, murajahDB);
      dataCache[key] = freshData;
      Logger.info(Logger.MODULES.DATA, `Cached ${key} refreshed in background`);
      if (typeof onBackgroundUpdate === 'function') {
        onBackgroundUpdate(key, freshData, { source: 'background' });
      }
    } catch (error) {
      Logger.warn(Logger.MODULES.DATA, `Background refresh failed for ${key}`, error);
    } finally {
      resourceRefreshState[key] = false;
    }
  }, 100);
};

const loadResourceWithCache = async ({ resourceConfig, murajahDB, onBackgroundUpdate }) => {
  if (!resourceConfig) {
    throw new Error('[Murajah] Resource configuration is required');
  }

  if (murajahDB) {
    try {
      const cached = await murajahDB.loadCachedResource(resourceConfig.cacheId);
      if (cached?.data) {
        scheduleResourceRefresh(resourceConfig, murajahDB, onBackgroundUpdate);
        return cached.data;
      }
    } catch (error) {
      Logger.warn(Logger.MODULES.DATA, `Failed to read cached ${resourceConfig.key}`, error);
    }
  }

  const data = await fetchAndCacheResource(resourceConfig, murajahDB);
  scheduleResourceRefresh(resourceConfig, murajahDB, onBackgroundUpdate);
  return data;
};

/**
 * Load all Quran data files in parallel
 * @returns {Promise<Object>} Combined data object
 */
export const loadAllQuranData = async ({ murajahDB, onTranslationUpdate, onResourceUpdate } = {}) => {
  const handleBackgroundUpdate = (resourceKey, freshData, meta = {}) => {
    if (resourceKey === 'translations' && typeof onTranslationUpdate === 'function') {
      onTranslationUpdate(freshData, meta);
    }
    if (typeof onResourceUpdate === 'function') {
      onResourceUpdate({ key: resourceKey, data: freshData, ...meta });
    }
  };

  if (dataCache.isLoaded) {
    Object.values(RESOURCE_CONFIGS).forEach(config => scheduleResourceRefresh(config, murajahDB, handleBackgroundUpdate));
    Logger.debug(Logger.MODULES.DATA, 'Returning cached Quran data');
    return {
      layout: dataCache.layout,
      words: dataCache.words,
      surahNames: dataCache.surahNames,
      translations: dataCache.translations,
      pageLines: []
    };
  }

  try {
    Logger.info(Logger.MODULES.DATA, 'Loading Quran data files...');
    const startTime = performance.now();

    const [layoutData, wordsData, surahNamesData, translationsData] = await Promise.all([
      loadResourceWithCache({ resourceConfig: RESOURCE_CONFIGS.layout, murajahDB, onBackgroundUpdate: handleBackgroundUpdate }),
      loadResourceWithCache({ resourceConfig: RESOURCE_CONFIGS.words, murajahDB, onBackgroundUpdate: handleBackgroundUpdate }),
      loadResourceWithCache({ resourceConfig: RESOURCE_CONFIGS.surahNames, murajahDB, onBackgroundUpdate: handleBackgroundUpdate }),
      loadResourceWithCache({ resourceConfig: RESOURCE_CONFIGS.translations, murajahDB, onBackgroundUpdate: handleBackgroundUpdate })
    ]);

    dataCache.layout = layoutData;
    dataCache.words = wordsData;
    dataCache.surahNames = surahNamesData;
    dataCache.translations = translationsData;
    dataCache.isLoaded = true;

    const duration = performance.now() - startTime;
    Logger.info(Logger.MODULES.DATA, 'Quran data loaded successfully', {
      duration: `${duration.toFixed(2)}ms`,
      pages: layoutData.pages.length,
      words: Object.keys(wordsData).length,
      surahs: Object.keys(surahNamesData).length
    });

    return {
      layout: layoutData,
      words: wordsData,
      surahNames: surahNamesData,
      translations: translationsData,
      pageLines: []
    };
  } catch (error) {
    Logger.error(Logger.MODULES.DATA, 'Failed to load Quran data', error);
    throw error;
  }
};

/**
 * Get text for a specific page
 * @param {number} pageNum - Page number (1-604)
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
      
      // Get words for this line using fast ID lookup
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
 * @param {number} pageNum - Page number (1-604)
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
 * Returns structured data for each word with IDs and metadata
 * @param {number} pageNum - Page number (1-604)
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
          surah: line.surah_number,
          text: `Surah ${line.surah_number}`,
          words: []
        };
      }
      
      // Get words for this line using fast ID lookup
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

export const clearDataCache = () => {
  dataCache.layout = null;
  dataCache.words = null;
  dataCache.surahNames = null;
  dataCache.translations = null;
  dataCache.isLoaded = false;
  Object.keys(resourceRefreshState).forEach(key => {
    resourceRefreshState[key] = false;
  });
  Logger.info(Logger.MODULES.DATA, 'Data cache cleared');
};

/**
 * Check if data is cached
 */
export const isDataCached = () => {
  return dataCache.isLoaded;
};
