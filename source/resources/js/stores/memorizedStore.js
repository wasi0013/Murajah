/**
 * Memorized Store - Track memorized pages
 * Manages: memorized pages set, statistics, bulk operations
 */

import { reactive, computed } from 'vue';

export const memorizedStore = reactive({
    memorizedPages: new Set(),
    lastUpdated: null
});

/**
 * Toggle memorized status for a page
 */
export const toggleMemorized = async (pageNum, murajahDB) => {
    try {
        if (memorizedStore.memorizedPages.has(pageNum)) {
            memorizedStore.memorizedPages.delete(pageNum);
            await murajahDB.removeMemorized(pageNum);
            console.log(`[Murajah] Page ${pageNum} unmarked as memorized`);
        } else {
            memorizedStore.memorizedPages.add(pageNum);
            await murajahDB.addMemorized(pageNum);
            console.log(`[Murajah] Page ${pageNum} marked as memorized`);
        }
        memorizedStore.lastUpdated = new Date();
    } catch (error) {
        console.error('[Murajah] Error toggling memorized:', error);
        throw error;
    }
};

/**
 * Check if a page is memorized
 */
export const isMemorized = (pageNum) => {
    return memorizedStore.memorizedPages.has(pageNum);
};

/**
 * Bulk mark pages as memorized
 */
export const bulkMarkMemorized = async (start, end, murajahDB) => {
    try {
        if (start < 1 || end > 604 || start > end) {
            throw new Error('Invalid page range');
        }

        const count = end - start + 1;
        console.log(`[Murajah] Bulk marking ${count} pages as memorized...`);

        for (let page = start; page <= end; page++) {
            if (!memorizedStore.memorizedPages.has(page)) {
                memorizedStore.memorizedPages.add(page);
                await murajahDB.addMemorized(page);
            }
        }

        memorizedStore.lastUpdated = new Date();
        console.log(`[Murajah] Successfully marked ${count} pages as memorized`);
    } catch (error) {
        console.error('[Murajah] Error in bulk mark:', error);
        throw error;
    }
};

/**
 * Bulk unmark pages as memorized
 */
export const bulkUnmarkMemorized = async (start, end, murajahDB) => {
    try {
        if (start < 1 || end > 604 || start > end) {
            throw new Error('Invalid page range');
        }

        const count = end - start + 1;
        console.log(`[Murajah] Bulk unmarking ${count} pages...`);

        for (let page = start; page <= end; page++) {
            if (memorizedStore.memorizedPages.has(page)) {
                memorizedStore.memorizedPages.delete(page);
                await murajahDB.removeMemorized(page);
            }
        }

        memorizedStore.lastUpdated = new Date();
        console.log(`[Murajah] Successfully unmarked ${count} pages`);
    } catch (error) {
        console.error('[Murajah] Error in bulk unmark:', error);
        throw error;
    }
};

/**
 * Load memorized pages from IndexedDB
 */
export const loadMemorizedPages = async (murajahDB) => {
    try {
        const pages = await murajahDB.getMemorized();
        memorizedStore.memorizedPages = new Set(pages);
        memorizedStore.lastUpdated = new Date();
        console.log(`[Murajah] Loaded ${pages.length} memorized pages`);
    } catch (error) {
        console.error('[Murajah] Error loading memorized pages:', error);
        throw error;
    }
};

/**
 * Clear all memorized pages
 */
export const clearAllMemorized = async (murajahDB) => {
    try {
        const count = memorizedStore.memorizedPages.size;
        for (const page of memorizedStore.memorizedPages) {
            await murajahDB.removeMemorized(page);
        }
        memorizedStore.memorizedPages.clear();
        memorizedStore.lastUpdated = new Date();
        console.log(`[Murajah] Cleared ${count} memorized pages`);
    } catch (error) {
        console.error('[Murajah] Error clearing memorized pages:', error);
        throw error;
    }
};

// Computed properties
export const memorizedCount = computed(() => 
    memorizedStore.memorizedPages.size
);

export const memorizedPercentage = computed(() => {
    const total = 604;
    return Math.round((memorizedCount.value / total) * 100);
});

export const juzCount = computed(() => 
    Math.floor(memorizedCount.value / 20)
);

export const remainingPages = computed(() => 
    604 - memorizedCount.value
);

export const memorizedArray = computed(() => 
    Array.from(memorizedStore.memorizedPages).sort((a, b) => a - b)
);
