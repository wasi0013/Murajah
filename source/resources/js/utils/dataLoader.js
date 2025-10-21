/**
 * Murajah Data Loader Utility
 * Handles loading and parsing all Quran data from JSON files
 */

const dataCache = {
  layout: null,
  words: null,
  surahNames: null,
  translations: null,
  isLoaded: false
};

/**
 * Load all Quran data files in parallel
 * @returns {Promise<Object>} Combined data object
 */
export const loadAllQuranData = async () => {
  if (dataCache.isLoaded) {
    return {
      layout: dataCache.layout,
      words: dataCache.words,
      surahNames: dataCache.surahNames,
      translations: dataCache.translations,
      pageLines: [] // Empty initially, load on demand
    };
  }

  try {
    console.log('[Murajah] Loading Quran data...');
    
    const [layoutData, wordsData, surahNamesData, translationsData] = await Promise.all([
      fetch('./resources/qpc-v2-15-lines.json').then(r => r.json()),
      fetch('./resources/qpc-v2-word-by-word.json').then(r => r.json()),
      fetch('./resources/surah-names.json').then(r => r.json()),
      fetch('./resources/english-wbw-translation.json').then(r => r.json())
    ]);

    dataCache.layout = layoutData;
    dataCache.words = wordsData;
    dataCache.surahNames = surahNamesData;
    dataCache.translations = translationsData;
    dataCache.isLoaded = true;

    console.log('[Murajah] All Quran data loaded successfully');
    console.log(`[Murajah] Layout pages: ${layoutData.pages.length}`);
    console.log(`[Murajah] Words count: ${Object.keys(wordsData).length}`);
    
    return {
      layout: layoutData,
      words: wordsData,
      surahNames: surahNamesData,
      translations: translationsData,
      pageLines: [] // Empty initially, load on demand
    };
  } catch (error) {
    console.error('[Murajah] Failed to load Quran data:', error);
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
    console.error(`[Murajah] Error getting page ${pageNum}:`, error);
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
    console.error(`[Murajah] Error getting page words for page ${pageNum}:`, error);
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
 * Clear cache (for testing or data refresh)
 */
export const clearDataCache = () => {
  dataCache.layout = null;
  dataCache.words = null;
  dataCache.surahNames = null;
  dataCache.translations = null;
  dataCache.isLoaded = false;
  console.log('[Murajah] Data cache cleared');
};

/**
 * Check if data is cached
 */
export const isDataCached = () => {
  return dataCache.isLoaded;
};
