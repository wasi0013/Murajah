/**
 * quizHelpers.js — Shared quiz algorithm utilities for Murajah Quiz
 *
 * Optimized for low-end Android devices:
 * - Cached data structures avoid O(n) full-dataset scans per question
 * - Swap-to-end random selection avoids O(n) splice operations
 * - Pre-built indexes turn 77K-word scans into O(1) lookups
 */

/**
 * Fisher-Yates (Durstenfeld) in-place shuffle.
 * Mutates the input array and returns it.
 * @param {Array} arr
 * @returns {Array} the same array, shuffled
 */
export function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

/**
 * Pick a random element from an array.
 * @param {Array} arr
 * @returns {*} a random element, or undefined if empty
 */
export function pickRandom(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build a flat cached array of all verses from the translation data.
 * Call once after loading translation data; reuse the result for every question.
 *
 * @param {Object} translationData — { "1": [{ chapter, verse, text }], "2": [...], ... }
 * @returns {Array<{chapter: number, verse: number, text: string}>}
 */
export function buildVerseCache(translationData) {
    if (!translationData) return [];
    const allVerses = [];
    const keys = Object.keys(translationData);
    for (let k = 0; k < keys.length; k++) {
        const surahVerses = translationData[keys[k]];
        if (Array.isArray(surahVerses)) {
            for (let v = 0; v < surahVerses.length; v++) {
                allVerses.push(surahVerses[v]);
            }
        }
    }
    return allVerses;
}

/**
 * Pick `count` random verses from a pre-built cache, excluding the current verse.
 * Uses index-swap selection for O(count) performance instead of O(n).
 *
 * @param {Array} cachedVerses — flat array from buildVerseCache()
 * @param {{chapter: number, verse: number}} currentVerse — verse to exclude
 * @param {number} count — how many random verses to pick
 * @returns {Array} selected verses
 */
export function getRandomVerses(cachedVerses, currentVerse, count) {
    if (!cachedVerses || cachedVerses.length === 0) return [];

    // Build a list of eligible indices (exclude current verse)
    // For typical Quran data (~6236 verses), this is fast
    const eligible = [];
    for (let i = 0; i < cachedVerses.length; i++) {
        const v = cachedVerses[i];
        if (v.chapter !== currentVerse.chapter || v.verse !== currentVerse.verse) {
            eligible.push(i);
        }
    }

    const resultCount = Math.min(count, eligible.length);
    const result = new Array(resultCount);

    // Partial Fisher-Yates: shuffle only `resultCount` positions from the end
    let len = eligible.length;
    for (let i = 0; i < resultCount; i++) {
        const randIdx = Math.floor(Math.random() * len);
        result[i] = cachedVerses[eligible[randIdx]];
        // Swap selected to end and shrink available range
        eligible[randIdx] = eligible[len - 1];
        len--;
    }

    return result;
}

/**
 * Build a page-to-word-texts index from layout pages and word data.
 * Call once after loading word-by-word and layout data.
 * Turns O(77K) per-question scan into O(1) Map lookup.
 *
 * @param {Object} wordsMap — word-by-word data, keyed by word hash
 * @param {{pages: Array<{page_number: number, first_word_id: number, last_word_id: number}>}} layout
 * @returns {Map<number, string[]>} pageNum → array of unique word text strings
 */
export function buildPageWordIndex(wordsMap, layout) {
    const index = new Map();
    if (!layout || !layout.pages || !wordsMap) return index;

    // Build a sorted array of word entries for binary-search–friendly access
    // Words object is keyed by hash; convert to array sorted by id once
    const wordEntries = Object.values(wordsMap);

    // Sort by id for efficient range extraction
    wordEntries.sort((a, b) => a.id - b.id);

    // For each page, use the sorted array to extract words in range
    for (let p = 0; p < layout.pages.length; p++) {
        const page = layout.pages[p];
        const firstId = page.first_word_id;
        const lastId = page.last_word_id;

        // Binary search for first id
        let lo = 0, hi = wordEntries.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (wordEntries[mid].id < firstId) lo = mid + 1;
            else hi = mid;
        }

        const texts = new Set();
        for (let i = lo; i < wordEntries.length && wordEntries[i].id <= lastId; i++) {
            if (wordEntries[i].text) {
                texts.add(wordEntries[i].text);
            }
        }
        index.set(page.page_number, Array.from(texts));
    }

    return index;
}

/**
 * Pick `count` random wrong words from an array, excluding words in correctSet.
 * Uses swap-to-end for O(count) instead of O(n) splice.
 *
 * @param {string[]} available — pool of candidate word texts
 * @param {Set<string>} correctSet — correct answers to exclude
 * @param {number} count — how many wrong words to pick
 * @returns {string[]} selected wrong words (no duplicates)
 */
export function pickRandomWrongWords(available, correctSet, count) {
    // Filter out correct answers first
    const pool = [];
    for (let i = 0; i < available.length; i++) {
        if (!correctSet.has(available[i])) {
            pool.push(available[i]);
        }
    }

    const resultCount = Math.min(count, pool.length);
    const result = new Array(resultCount);

    // Swap-to-end selection (partial Fisher-Yates)
    let len = pool.length;
    for (let i = 0; i < resultCount; i++) {
        const randIdx = Math.floor(Math.random() * len);
        result[i] = pool[randIdx];
        pool[randIdx] = pool[len - 1];
        len--;
    }

    return result;
}

/**
 * Calculate how many total options (including correct) are possible
 * for a continuation quiz given the surah's verse count.
 *
 * For a continuation question we need: the displayed verse + the correct answer + N wrong answers.
 * usedIndices = {displayedIdx, correctIdx}, so wrong options come from remaining verses.
 *
 * @param {number} surahVerseCount — total verses in the surah
 * @returns {number} max total options (including the 1 correct); minimum 1
 */
export function getContinuationOptionCount(surahVerseCount) {
    // We need at least 3 verses: displayed, correct, and 1 wrong
    if (surahVerseCount < 3) return 1; // Can only show correct answer
    // Available for wrong answers = total - 2 (displayed + correct)
    const availableWrong = surahVerseCount - 2;
    // We want 3 wrong + 1 correct = 4 total, but cap at available
    return Math.min(4, 1 + availableWrong);
}

/**
 * Generate continuation quiz options (correct + wrong answers) for a surah.
 * Shared between regular and lightning continuation quiz.
 *
 * @param {Array} surahVerses — array of verse objects for the surah
 * @param {number} selectedVerseIndex — index of the displayed verse  
 * @param {number} correctVerseIndex — index of the correct answer verse
 * @param {number} maxOptions — max total options (from getContinuationOptionCount)
 * @returns {Array<{text: string, verse: number, isCorrect: boolean}>} shuffled options
 */
export function generateContinuationOptions(surahVerses, selectedVerseIndex, correctVerseIndex, maxOptions) {
    const options = [{
        text: surahVerses[correctVerseIndex].text,
        verse: correctVerseIndex + 1,
        isCorrect: true
    }];

    const usedIndices = new Set([selectedVerseIndex, correctVerseIndex]);
    const maxWrong = maxOptions - 1;
    
    // Build list of available indices (excluding used ones)
    const availableIndices = [];
    for (let i = 0; i < surahVerses.length; i++) {
        if (!usedIndices.has(i)) {
            availableIndices.push(i);
        }
    }

    // Partial Fisher-Yates to pick maxWrong from available
    const wrongCount = Math.min(maxWrong, availableIndices.length);
    let len = availableIndices.length;
    for (let i = 0; i < wrongCount; i++) {
        const randIdx = Math.floor(Math.random() * len);
        const idx = availableIndices[randIdx];
        options.push({
            text: surahVerses[idx].text,
            verse: idx + 1,
            isCorrect: false
        });
        availableIndices[randIdx] = availableIndices[len - 1];
        len--;
    }

    return shuffleArray(options);
}

/**
 * Generate translation quiz options (correct + wrong translations).
 * Shared between regular and lightning translation quiz.
 *
 * @param {Array} cachedVerses — flat array from buildVerseCache()
 * @param {{chapter: number, verse: number, text: string}} correctTranslation
 * @param {{chapter: number, verse: number}} currentVerse — to exclude
 * @param {number} wrongCount — number of wrong answers (typically 3)
 * @returns {Array<{text: string, isCorrect: boolean}>} shuffled options
 */
export function generateTranslationOptions(cachedVerses, correctTranslation, currentVerse, wrongCount) {
    const wrongVerses = getRandomVerses(cachedVerses, currentVerse, wrongCount);

    const options = [
        { text: correctTranslation.text, isCorrect: true },
        ...wrongVerses.map(v => ({ text: v.text, isCorrect: false }))
    ];

    return shuffleArray(options);
}

/**
 * Pre-load fonts for a set of page numbers in batches during idle time.
 * Non-blocking — uses requestIdleCallback (or setTimeout fallback).
 *
 * @param {number[]} pageNumbers — pages to preload
 * @param {number} batchSize — how many to load per idle callback (default 5)
 */
export function preloadFontsForPages(pageNumbers, batchSize = 5) {
    if (!pageNumbers || pageNumbers.length === 0) return;

    const schedule = typeof requestIdleCallback === 'function'
        ? requestIdleCallback
        : (cb) => setTimeout(cb, 16);

    let idx = 0;

    function loadBatch() {
        const end = Math.min(idx + batchSize, pageNumbers.length);
        for (let i = idx; i < end; i++) {
            const pageNum = pageNumbers[i];
            const fontId = `qpc-page-${pageNum}`;
            if (document.getElementById(fontId)) continue; // Already loaded

            const styleTag = document.createElement('style');
            styleTag.id = fontId;
            const src = `src: url('./resources/styles/fonts/qpc-v2/p${pageNum}.woff2') format('woff2')`;
            styleTag.textContent = `@font-face { font-family: 'QPCPage${pageNum}'; ${src}; font-weight: normal; font-style: normal; font-display: swap; }`;
            document.head.appendChild(styleTag);
        }
        idx = end;
        if (idx < pageNumbers.length) {
            schedule(loadBatch);
        }
    }

    schedule(loadBatch);
}

/**
 * Get all page numbers that belong to a set of surahs, using the Quran data.
 *
 * @param {Object} quranData — { "1": [{page, chapter, verse, text}, ...], ... }
 * @param {number[]} surahNums — selected surah numbers
 * @returns {number[]} unique page numbers, sorted ascending
 */
export function getPagesForSurahs(quranData, surahNums) {
    const pages = new Set();
    for (let i = 0; i < surahNums.length; i++) {
        const surahNum = surahNums[i];
        const verses = quranData[surahNum];
        if (!verses) continue;
        for (let v = 0; v < verses.length; v++) {
            if (verses[v].page) {
                pages.add(verses[v].page);
            }
        }
    }
    return Array.from(pages).sort((a, b) => a - b);
}
