/**
 * Unit tests for quizHelpers.js
 * Tests all quiz algorithm utilities for correctness, edge cases, and performance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    shuffleArray,
    pickRandom,
    buildVerseCache,
    getRandomVerses,
    buildPageWordIndex,
    pickRandomWrongWords,
    getContinuationOptionCount,
    generateContinuationOptions,
    generateTranslationOptions,
    preloadFontsForPages,
    getPagesForSurahs
} = await import('../../source/resources/js/utils/quizHelpers.js');


// ─── Test Data Fixtures ─────────────────────────────────────────────────────

function makeTranslationData() {
    // Mimics en.json: { "1": [{chapter, verse, text}, ...], ... }
    return {
        "1": [
            { chapter: 1, verse: 1, text: "In the name of Allah" },
            { chapter: 1, verse: 2, text: "All praise is due to Allah" },
            { chapter: 1, verse: 3, text: "The Most Gracious" },
            { chapter: 1, verse: 4, text: "Master of the Day" },
            { chapter: 1, verse: 5, text: "You alone we worship" },
            { chapter: 1, verse: 6, text: "Guide us to the straight path" },
            { chapter: 1, verse: 7, text: "The path of those" }
        ],
        "112": [
            { chapter: 112, verse: 1, text: "Say He is Allah the One" },
            { chapter: 112, verse: 2, text: "Allah the Eternal" },
            { chapter: 112, verse: 3, text: "He begets not" },
            { chapter: 112, verse: 4, text: "Nor is there any equivalent" }
        ],
        "114": [
            { chapter: 114, verse: 1, text: "Say I seek refuge" },
            { chapter: 114, verse: 2, text: "The King of mankind" },
            { chapter: 114, verse: 3, text: "The God of mankind" },
            { chapter: 114, verse: 4, text: "From the evil" },
            { chapter: 114, verse: 5, text: "Who whispers" },
            { chapter: 114, verse: 6, text: "From among jinn" }
        ]
    };
}

function makeWordsMap() {
    const words = {};
    // 3 pages, 5 words each (IDs 1-15)
    for (let i = 1; i <= 15; i++) {
        words[`word-${i}`] = { id: i, text: `word${i}` };
    }
    return words;
}

function makeLayout() {
    return {
        pages: [
            { page_number: 1, first_word_id: 1, last_word_id: 5 },
            { page_number: 2, first_word_id: 6, last_word_id: 10 },
            { page_number: 3, first_word_id: 11, last_word_id: 15 }
        ]
    };
}


// ─── shuffleArray ────────────────────────────────────────────────────────────

describe('shuffleArray()', () => {
    it('should return the same array reference (in-place)', () => {
        const arr = [1, 2, 3, 4, 5];
        const result = shuffleArray(arr);
        expect(result).toBe(arr);
    });

    it('should preserve all elements (no loss/duplication)', () => {
        const arr = [10, 20, 30, 40, 50];
        shuffleArray(arr);
        expect(arr.sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50]);
    });

    it('should handle empty array', () => {
        const arr = [];
        expect(shuffleArray(arr)).toEqual([]);
    });

    it('should handle single element', () => {
        const arr = [42];
        expect(shuffleArray(arr)).toEqual([42]);
    });

    it('should handle two elements', () => {
        const arr = [1, 2];
        shuffleArray(arr);
        expect(arr.sort((a, b) => a - b)).toEqual([1, 2]);
    });

    it('should actually shuffle (not always identity) for large arrays', () => {
        const original = Array.from({ length: 100 }, (_, i) => i);
        const copy = [...original];
        shuffleArray(copy);
        // Very unlikely to remain identical after shuffle
        const isSame = copy.every((v, i) => v === original[i]);
        expect(isSame).toBe(false);
    });
});


// ─── pickRandom ──────────────────────────────────────────────────────────────

describe('pickRandom()', () => {
    it('should return an element from the array', () => {
        const arr = [1, 2, 3];
        const result = pickRandom(arr);
        expect(arr).toContain(result);
    });

    it('should return undefined for empty array', () => {
        expect(pickRandom([])).toBeUndefined();
    });

    it('should return undefined for null/undefined', () => {
        expect(pickRandom(null)).toBeUndefined();
        expect(pickRandom(undefined)).toBeUndefined();
    });

    it('should return the only element for single-element array', () => {
        expect(pickRandom([99])).toBe(99);
    });
});


// ─── buildVerseCache ─────────────────────────────────────────────────────────

describe('buildVerseCache()', () => {
    it('should flatten all surah verses into a single array', () => {
        const data = makeTranslationData();
        const cache = buildVerseCache(data);
        // 7 + 4 + 6 = 17
        expect(cache).toHaveLength(17);
    });

    it('should return empty array for null input', () => {
        expect(buildVerseCache(null)).toEqual([]);
    });

    it('should return empty array for empty object', () => {
        expect(buildVerseCache({})).toEqual([]);
    });

    it('should preserve verse objects', () => {
        const data = { "1": [{ chapter: 1, verse: 1, text: "test" }] };
        const cache = buildVerseCache(data);
        expect(cache[0]).toEqual({ chapter: 1, verse: 1, text: "test" });
    });

    it('should skip non-array surah entries', () => {
        const data = { "1": [{ chapter: 1, verse: 1, text: "a" }], "bad": "not-array" };
        const cache = buildVerseCache(data);
        expect(cache).toHaveLength(1);
    });
});


// ─── getRandomVerses ─────────────────────────────────────────────────────────

describe('getRandomVerses()', () => {
    let cache;
    beforeEach(() => {
        cache = buildVerseCache(makeTranslationData());
    });

    it('should return the requested number of verses', () => {
        const result = getRandomVerses(cache, { chapter: 1, verse: 1 }, 3);
        expect(result).toHaveLength(3);
    });

    it('should exclude the current verse', () => {
        const current = { chapter: 1, verse: 1 };
        const results = getRandomVerses(cache, current, 16); // All but one
        for (const v of results) {
            expect(v.chapter !== 1 || v.verse !== 1).toBe(true);
        }
    });

    it('should not return duplicates', () => {
        const results = getRandomVerses(cache, { chapter: 1, verse: 1 }, 10);
        const keys = results.map(v => `${v.chapter}:${v.verse}`);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('should handle count larger than available verses', () => {
        // 17 total, exclude 1 = 16 available
        const results = getRandomVerses(cache, { chapter: 1, verse: 1 }, 100);
        expect(results).toHaveLength(16);
    });

    it('should return empty for null/empty cache', () => {
        expect(getRandomVerses(null, { chapter: 1, verse: 1 }, 3)).toEqual([]);
        expect(getRandomVerses([], { chapter: 1, verse: 1 }, 3)).toEqual([]);
    });

    it('should work with count = 0', () => {
        const results = getRandomVerses(cache, { chapter: 1, verse: 1 }, 0);
        expect(results).toHaveLength(0);
    });
});


// ─── buildPageWordIndex ──────────────────────────────────────────────────────

describe('buildPageWordIndex()', () => {
    it('should create a Map with correct page numbers', () => {
        const index = buildPageWordIndex(makeWordsMap(), makeLayout());
        expect(index).toBeInstanceOf(Map);
        expect(index.has(1)).toBe(true);
        expect(index.has(2)).toBe(true);
        expect(index.has(3)).toBe(true);
    });

    it('should have correct words per page', () => {
        const index = buildPageWordIndex(makeWordsMap(), makeLayout());
        expect(index.get(1)).toHaveLength(5); // word1..word5
        expect(index.get(2)).toHaveLength(5); // word6..word10
        expect(index.get(3)).toHaveLength(5); // word11..word15
    });

    it('should include correct word texts', () => {
        const index = buildPageWordIndex(makeWordsMap(), makeLayout());
        expect(index.get(1)).toContain('word1');
        expect(index.get(1)).toContain('word5');
        expect(index.get(2)).toContain('word6');
    });

    it('should return empty Map for null inputs', () => {
        expect(buildPageWordIndex(null, makeLayout()).size).toBe(0);
        expect(buildPageWordIndex(makeWordsMap(), null).size).toBe(0);
    });

    it('should handle layout with no pages', () => {
        expect(buildPageWordIndex(makeWordsMap(), { pages: [] }).size).toBe(0);
    });

    it('should deduplicate words with same text', () => {
        const words = {
            a: { id: 1, text: 'bismillah' },
            b: { id: 2, text: 'bismillah' },
            c: { id: 3, text: 'alhamdulillah' }
        };
        const layout = { pages: [{ page_number: 1, first_word_id: 1, last_word_id: 3 }] };
        const index = buildPageWordIndex(words, layout);
        // 'bismillah' appears twice but should be deduplicated via Set
        expect(index.get(1)).toHaveLength(2);
    });
});


// ─── pickRandomWrongWords ────────────────────────────────────────────────────

describe('pickRandomWrongWords()', () => {
    it('should return the requested count', () => {
        const available = ['a', 'b', 'c', 'd', 'e'];
        const correctSet = new Set(['a']);
        const result = pickRandomWrongWords(available, correctSet, 3);
        expect(result).toHaveLength(3);
    });

    it('should exclude correct answers', () => {
        const available = ['a', 'b', 'c', 'd', 'e'];
        const correctSet = new Set(['a', 'b']);
        const result = pickRandomWrongWords(available, correctSet, 3);
        expect(result).toHaveLength(3);
        for (const w of result) {
            expect(correctSet.has(w)).toBe(false);
        }
    });

    it('should not return duplicates', () => {
        const available = ['a', 'b', 'c', 'd', 'e', 'f'];
        const correctSet = new Set([]);
        const result = pickRandomWrongWords(available, correctSet, 5);
        expect(new Set(result).size).toBe(5);
    });

    it('should cap at available pool size', () => {
        const available = ['a', 'b', 'c'];
        const correctSet = new Set(['a']);
        // Only 2 available after excluding, but asking for 10
        const result = pickRandomWrongWords(available, correctSet, 10);
        expect(result).toHaveLength(2);
    });

    it('should return empty when all words are correct', () => {
        const available = ['a', 'b'];
        const correctSet = new Set(['a', 'b']);
        expect(pickRandomWrongWords(available, correctSet, 3)).toHaveLength(0);
    });
});


// ─── getContinuationOptionCount ──────────────────────────────────────────────

describe('getContinuationOptionCount()', () => {
    it('should return 1 for tiny surahs (< 3 verses)', () => {
        expect(getContinuationOptionCount(1)).toBe(1);
        expect(getContinuationOptionCount(2)).toBe(1);
    });

    it('should return 2 for 3-verse surah (1 correct + 1 wrong)', () => {
        // 3 verses - 2 used = 1 available for wrong
        expect(getContinuationOptionCount(3)).toBe(2);
    });

    it('should cap at 4 for large surahs', () => {
        expect(getContinuationOptionCount(286)).toBe(4); // Al-Baqarah
        expect(getContinuationOptionCount(200)).toBe(4);
        expect(getContinuationOptionCount(6)).toBe(4); // 6-2=4 wrong, so 1+4>4, capped
    });

    it('should return 4 for exactly 5 verses', () => {
        // 5 - 2 = 3 available wrong, 1 correct + 3 wrong = 4
        expect(getContinuationOptionCount(5)).toBe(4);
    });

    it('should return 3 for 4-verse surah', () => {
        // 4 - 2 = 2 available wrong, 1 + 2 = 3
        expect(getContinuationOptionCount(4)).toBe(3);
    });
});


// ─── generateContinuationOptions ─────────────────────────────────────────────

describe('generateContinuationOptions()', () => {
    const surahVerses = [
        { text: 'verse1' },
        { text: 'verse2' },
        { text: 'verse3' },
        { text: 'verse4' },
        { text: 'verse5' },
        { text: 'verse6' },
        { text: 'verse7' }
    ];

    it('should include exactly one correct answer', () => {
        const options = generateContinuationOptions(surahVerses, 0, 1, 4);
        const correct = options.filter(o => o.isCorrect);
        expect(correct).toHaveLength(1);
        expect(correct[0].text).toBe('verse2');
    });

    it('should have the requested total options', () => {
        const options = generateContinuationOptions(surahVerses, 0, 1, 4);
        expect(options).toHaveLength(4);
    });

    it('should not include the displayed verse in options', () => {
        const options = generateContinuationOptions(surahVerses, 0, 1, 4);
        const hasDisplayed = options.some(o => o.text === 'verse1');
        expect(hasDisplayed).toBe(false);
    });

    it('should work with small surah (3 verses, maxOptions=2)', () => {
        const small = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
        const options = generateContinuationOptions(small, 0, 1, 2);
        expect(options).toHaveLength(2);
        expect(options.some(o => o.isCorrect)).toBe(true);
    });

    it('should assign correct verse numbers (1-indexed)', () => {
        const options = generateContinuationOptions(surahVerses, 0, 1, 4);
        const correct = options.find(o => o.isCorrect);
        expect(correct.verse).toBe(2); // index 1 + 1
    });

    it('should handle maxOptions=1 (only correct answer)', () => {
        const options = generateContinuationOptions(surahVerses, 0, 1, 1);
        expect(options).toHaveLength(1);
        expect(options[0].isCorrect).toBe(true);
    });
});


// ─── generateTranslationOptions ──────────────────────────────────────────────

describe('generateTranslationOptions()', () => {
    let cache;
    beforeEach(() => {
        cache = buildVerseCache(makeTranslationData());
    });

    it('should include the correct translation', () => {
        const correct = { chapter: 1, verse: 1, text: "In the name of Allah" };
        const options = generateTranslationOptions(cache, correct, { chapter: 1, verse: 1 }, 3);
        expect(options.some(o => o.isCorrect && o.text === correct.text)).toBe(true);
    });

    it('should have correct + wrongCount total options', () => {
        const correct = { chapter: 1, verse: 1, text: "In the name of Allah" };
        const options = generateTranslationOptions(cache, correct, { chapter: 1, verse: 1 }, 3);
        expect(options).toHaveLength(4); // 1 correct + 3 wrong
    });

    it('should mark wrong options as not correct', () => {
        const correct = { chapter: 1, verse: 1, text: "In the name of Allah" };
        const options = generateTranslationOptions(cache, correct, { chapter: 1, verse: 1 }, 3);
        const wrong = options.filter(o => !o.isCorrect);
        expect(wrong).toHaveLength(3);
    });
});


// ─── getPagesForSurahs ───────────────────────────────────────────────────────

describe('getPagesForSurahs()', () => {
    const quranData = {
        "1": [
            { page: 1, chapter: 1, verse: 1, text: "a" },
            { page: 1, chapter: 1, verse: 2, text: "b" }
        ],
        "2": [
            { page: 2, chapter: 2, verse: 1, text: "c" },
            { page: 3, chapter: 2, verse: 255, text: "d" }
        ],
        "114": [
            { page: 604, chapter: 114, verse: 1, text: "e" }
        ]
    };

    it('should return unique page numbers sorted ascending', () => {
        const pages = getPagesForSurahs(quranData, [1, 2]);
        expect(pages).toEqual([1, 2, 3]);
    });

    it('should handle single surah', () => {
        expect(getPagesForSurahs(quranData, [114])).toEqual([604]);
    });

    it('should handle missing surah number', () => {
        expect(getPagesForSurahs(quranData, [999])).toEqual([]);
    });

    it('should deduplicate pages from same surah', () => {
        // Surah 1 has 2 verses both on page 1
        expect(getPagesForSurahs(quranData, [1])).toEqual([1]);
    });

    it('should handle all 114 surahs (no crash)', () => {
        const allSurahs = Array.from({ length: 114 }, (_, i) => i + 1);
        // Only 3 surahs exist in our test data
        const pages = getPagesForSurahs(quranData, allSurahs);
        expect(pages.length).toBeGreaterThan(0);
    });

    it('should handle empty surah list', () => {
        expect(getPagesForSurahs(quranData, [])).toEqual([]);
    });
});


// ─── Performance tests ───────────────────────────────────────────────────────

describe('Performance', () => {
    it('getRandomVerses should complete in < 10ms for 6236 verses', () => {
        // Simulate real Quran data size
        const bigCache = Array.from({ length: 6236 }, (_, i) => ({
            chapter: Math.floor(i / 50) + 1,
            verse: (i % 50) + 1,
            text: `verse-${i}`
        }));

        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            getRandomVerses(bigCache, { chapter: 1, verse: 1 }, 3);
        }
        const elapsed = (performance.now() - start) / 100;
        expect(elapsed).toBeLessThan(10);
    });

    it('pickRandomWrongWords should complete in < 5ms for 1000 words', () => {
        const pool = Array.from({ length: 1000 }, (_, i) => `word-${i}`);
        const correctSet = new Set(['word-0', 'word-1', 'word-2']);

        const start = performance.now();
        for (let i = 0; i < 100; i++) {
            pickRandomWrongWords(pool, correctSet, 10);
        }
        const elapsed = (performance.now() - start) / 100;
        expect(elapsed).toBeLessThan(5);
    });

    it('buildVerseCache should complete in < 50ms for full translation data', () => {
        // Simulate 114 surahs with varying verse counts
        const data = {};
        let total = 0;
        for (let s = 1; s <= 114; s++) {
            const verseCount = Math.floor(Math.random() * 200) + 3;
            data[String(s)] = Array.from({ length: verseCount }, (_, v) => ({
                chapter: s, verse: v + 1, text: `text-${s}-${v}`
            }));
            total += verseCount;
        }

        const start = performance.now();
        const cache = buildVerseCache(data);
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);
        expect(cache.length).toBe(total);
    });

    it('getContinuationOptionCount should never cause infinite loops', () => {
        // Test every possible surah size (1 to 286 verses)
        for (let size = 1; size <= 286; size++) {
            const count = getContinuationOptionCount(size);
            expect(count).toBeGreaterThanOrEqual(1);
            expect(count).toBeLessThanOrEqual(4);
        }
    });
});
