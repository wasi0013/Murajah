/**
 * Quran Store - Quran data management
 * Manages: layout data, words, surah names, translations
 */

import { reactive, computed } from 'vue';

export const quranStore = reactive({
    layoutData: [],
    wordsData: {},
    surahNames: {},
    translations: {},
    isLoaded: false
});

/**
 * Load all Quran data from JSON files
 */
export const loadQuranData = async () => {
    try {
        console.log('[Murajah] Loading Quran data...');
        
        const [layoutRes, wordsRes, surahRes, transRes] = await Promise.all([
            fetch('./resources/qpc-v2-15-lines.json'),
            fetch('./resources/qpc-v2-word-by-word.json'),
            fetch('./resources/surah-names.json'),
            fetch('./resources/english-wbw-translation.json')
        ]);

        if (!layoutRes.ok || !wordsRes.ok || !surahRes.ok || !transRes.ok) {
            throw new Error('Failed to load one or more data files');
        }

        const [layout, words, surah, trans] = await Promise.all([
            layoutRes.json(),
            wordsRes.json(),
            surahRes.json(),
            transRes.json()
        ]);

        // Handle both array and object formats
        quranStore.layoutData = layout.pages ? layout.pages : (Array.isArray(layout) ? layout : []);
        quranStore.wordsData = words;
        quranStore.surahNames = surah;
        quranStore.translations = trans;
        quranStore.isLoaded = true;

        console.log('[Murajah] Quran data loaded successfully');
        console.log(`  - Pages: ${quranStore.layoutData.length}`);
        console.log(`  - Words: ${Object.keys(quranStore.wordsData).length}`);
        console.log(`  - Surahs: ${Object.keys(quranStore.surahNames).length}`);
    } catch (error) {
        console.error('[Murajah] Error loading Quran data:', error);
        throw error;
    }
};

/**
 * Get all lines for a specific page
 */
export const getPageLines = (pageNum) => {
    return quranStore.layoutData.filter(line => 
        line.page_number === pageNum || line.pageNumber === pageNum
    );
};

/**
 * Get surah name by surah number
 */
export const getSurahName = (surahNum) => {
    if (!surahNum) return '';
    return quranStore.surahNames?.[surahNum] || `Surah ${surahNum}`;
};

/**
 * Get word by ID
 */
export const getWordById = (wordId) => {
    for (const key in quranStore.wordsData) {
        const word = quranStore.wordsData[key];
        if (word.id === wordId) {
            return word;
        }
    }
    return null;
};

/**
 * Get translation for a word
 */
export const getWordTranslation = (wordId) => {
    return quranStore.translations?.[wordId] || '';
};

/**
 * Get current surah for a page
 */
export const getCurrentSurah = (pageNum) => {
    const pageLines = getPageLines(pageNum);
    if (pageLines.length === 0) return '';
    
    // Find the surah name in the page
    const surahLine = pageLines.find(line => 
        line.line_type === 'surah_name' || line.type === 'surah_name'
    );
    
    if (surahLine && surahLine.surah_number) {
        return getSurahName(surahLine.surah_number);
    }
    
    return '';
};

// Computed properties
export const totalWords = computed(() => 
    Object.keys(quranStore.wordsData).length
);

export const totalSurahs = computed(() => 
    Object.keys(quranStore.surahNames).length
);
