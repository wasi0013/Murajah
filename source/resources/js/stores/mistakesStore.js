/**
 * Mistakes Store - Track mistakes per page
 * Manages: word-level mistake tracking, bubble grid data
 */

import { reactive, computed } from 'vue';

export const mistakesStore = reactive({
    mistakes: {}, // { pageNum: Set<wordId> }
    lastUpdated: null
});

/**
 * Toggle mistake for a word on a page
 */
export const toggleMistake = async (pageNum, wordId, murajahDB) => {
    try {
        const pageKey = String(pageNum);
        
        if (!mistakesStore.mistakes[pageKey]) {
            mistakesStore.mistakes[pageKey] = new Set();
        }

        if (mistakesStore.mistakes[pageKey].has(wordId)) {
            mistakesStore.mistakes[pageKey].delete(wordId);
            await murajahDB.removeMistake(pageNum, wordId);
            console.log(`[Murajah] Removed mistake for word ${wordId} on page ${pageNum}`);
        } else {
            mistakesStore.mistakes[pageKey].add(wordId);
            await murajahDB.addMistake(pageNum, wordId);
            console.log(`[Murajah] Added mistake for word ${wordId} on page ${pageNum}`);
        }

        mistakesStore.lastUpdated = new Date();
    } catch (error) {
        console.error('[Murajah] Error toggling mistake:', error);
        throw error;
    }
};

/**
 * Get mistakes for a specific page
 */
export const getPageMistakes = (pageNum) => {
    const pageKey = String(pageNum);
    return mistakesStore.mistakes[pageKey] || new Set();
};

/**
 * Check if a word is marked as mistake
 */
export const isMistake = (pageNum, wordId) => {
    return getPageMistakes(pageNum).has(wordId);
};

/**
 * Get all pages with mistakes, sorted by count
 */
export const getPagesWithMistakes = () => {
    const pagesWithCounts = [];
    
    for (const pageKey in mistakesStore.mistakes) {
        const pageNum = Number(pageKey);
        const count = mistakesStore.mistakes[pageKey].size;
        
        if (count > 0) {
            pagesWithCounts.push({ pageNum, count });
        }
    }
    
    // Sort by count (descending), then by page number (ascending)
    return pagesWithCounts.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.pageNum - b.pageNum;
    });
};

/**
 * Clear mistakes for a page
 */
export const clearPageMistakes = async (pageNum, murajahDB) => {
    try {
        const pageKey = String(pageNum);
        const wordIds = Array.from(mistakesStore.mistakes[pageKey] || new Set());
        
        for (const wordId of wordIds) {
            await murajahDB.removeMistake(pageNum, wordId);
        }
        
        delete mistakesStore.mistakes[pageKey];
        mistakesStore.lastUpdated = new Date();
        
        console.log(`[Murajah] Cleared ${wordIds.length} mistakes for page ${pageNum}`);
    } catch (error) {
        console.error('[Murajah] Error clearing page mistakes:', error);
        throw error;
    }
};

/**
 * Clear all mistakes
 */
export const clearAllMistakes = async (murajahDB) => {
    try {
        let totalCount = 0;
        
        for (const pageKey in mistakesStore.mistakes) {
            const pageNum = Number(pageKey);
            const wordIds = Array.from(mistakesStore.mistakes[pageKey]);
            
            for (const wordId of wordIds) {
                await murajahDB.removeMistake(pageNum, wordId);
                totalCount++;
            }
        }
        
        mistakesStore.mistakes = {};
        mistakesStore.lastUpdated = new Date();
        
        console.log(`[Murajah] Cleared all ${totalCount} mistakes`);
    } catch (error) {
        console.error('[Murajah] Error clearing all mistakes:', error);
        throw error;
    }
};

/**
 * Load mistakes from IndexedDB
 */
export const loadMistakes = async (murajahDB) => {
    try {
        const mistakes = await murajahDB.getAllMistakes();
        
        mistakesStore.mistakes = {};
        for (const mistake of mistakes) {
            const pageKey = String(mistake.pageNumber);
            if (!mistakesStore.mistakes[pageKey]) {
                mistakesStore.mistakes[pageKey] = new Set();
            }
            mistakesStore.mistakes[pageKey].add(mistake.wordId);
        }
        
        mistakesStore.lastUpdated = new Date();
        console.log(`[Murajah] Loaded mistakes for ${Object.keys(mistakesStore.mistakes).length} pages`);
    } catch (error) {
        console.error('[Murajah] Error loading mistakes:', error);
        throw error;
    }
};

// Computed properties
export const totalMistakes = computed(() => {
    let count = 0;
    for (const pageKey in mistakesStore.mistakes) {
        count += mistakesStore.mistakes[pageKey].size;
    }
    return count;
});

export const pagesWithMistakesCount = computed(() => 
    Object.keys(mistakesStore.mistakes).length
);

export const mistakeBubbleData = computed(() => 
    getPagesWithMistakes()
);
