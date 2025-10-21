/**
 * Settings Store - User preferences and configuration
 */

import { reactive, computed } from 'vue';

export const settingsStore = reactive({
    finishRevisionDays: 30,
    pagesPerDay: 1,
    perfectRevisions: {}, // { pageNum: count }
    tajweedEnabled: true,
    fontSize: 'medium', // small, medium, large
    lastUpdated: null
});

/**
 * Get perfect revision count for a page
 */
export const getPerfectCount = (pageNum) => {
    return settingsStore.perfectRevisions[pageNum] || 0;
};

/**
 * Increment perfect revision count for a page
 */
export const incrementPerfectCount = async (pageNum, murajahDB) => {
    try {
        const currentCount = getPerfectCount(pageNum);
        const newCount = currentCount + 1;
        
        settingsStore.perfectRevisions[pageNum] = newCount;
        await murajahDB.setPerfectCount(pageNum, newCount);
        
        settingsStore.lastUpdated = new Date();
        console.log(`[Murajah] Page ${pageNum} perfect revision count: ${newCount}`);
        
        return newCount;
    } catch (error) {
        console.error('[Murajah] Error incrementing perfect count:', error);
        throw error;
    }
};

/**
 * Set perfect revision count for a page
 */
export const setPerfectCount = async (pageNum, count, murajahDB) => {
    try {
        const validCount = Math.max(0, count);
        settingsStore.perfectRevisions[pageNum] = validCount;
        await murajahDB.setPerfectCount(pageNum, validCount);
        
        settingsStore.lastUpdated = new Date();
    } catch (error) {
        console.error('[Murajah] Error setting perfect count:', error);
        throw error;
    }
};

/**
 * Update finish revision days setting
 */
export const setFinishRevisionDays = async (days, murajahDB) => {
    try {
        settingsStore.finishRevisionDays = Math.max(1, days);
        await murajahDB.setSetting('finishRevisionDays', settingsStore.finishRevisionDays);
        settingsStore.lastUpdated = new Date();
        console.log('[Murajah] Set finish revision days to', settingsStore.finishRevisionDays);
    } catch (error) {
        console.error('[Murajah] Error setting revision days:', error);
        throw error;
    }
};

/**
 * Update pages per day setting
 */
export const setPagesPerDay = async (pages, murajahDB) => {
    try {
        settingsStore.pagesPerDay = Math.max(0.1, pages);
        await murajahDB.setSetting('pagesPerDay', settingsStore.pagesPerDay);
        settingsStore.lastUpdated = new Date();
        console.log('[Murajah] Set pages per day to', settingsStore.pagesPerDay);
    } catch (error) {
        console.error('[Murajah] Error setting pages per day:', error);
        throw error;
    }
};

/**
 * Toggle tajweed
 */
export const toggleTajweed = async (enabled, murajahDB) => {
    try {
        settingsStore.tajweedEnabled = enabled;
        await murajahDB.setSetting('tajweedEnabled', enabled);
        settingsStore.lastUpdated = new Date();
        console.log('[Murajah] Tajweed', enabled ? 'enabled' : 'disabled');
    } catch (error) {
        console.error('[Murajah] Error toggling tajweed:', error);
        throw error;
    }
};

/**
 * Set font size
 */
export const setFontSize = async (size, murajahDB) => {
    try {
        if (!['small', 'medium', 'large'].includes(size)) {
            throw new Error('Invalid font size');
        }
        settingsStore.fontSize = size;
        await murajahDB.setSetting('fontSize', size);
        settingsStore.lastUpdated = new Date();
        console.log('[Murajah] Font size set to', size);
    } catch (error) {
        console.error('[Murajah] Error setting font size:', error);
        throw error;
    }
};

/**
 * Load all settings from IndexedDB
 */
export const loadSettings = async (murajahDB) => {
    try {
        const [days, pages, tajweed, size] = await Promise.all([
            murajahDB.getSetting('finishRevisionDays', 30),
            murajahDB.getSetting('pagesPerDay', 1),
            murajahDB.getSetting('tajweedEnabled', true),
            murajahDB.getSetting('fontSize', 'medium')
        ]);

        settingsStore.finishRevisionDays = days;
        settingsStore.pagesPerDay = pages;
        settingsStore.tajweedEnabled = tajweed;
        settingsStore.fontSize = size;
        settingsStore.lastUpdated = new Date();

        console.log('[Murajah] Settings loaded');
    } catch (error) {
        console.error('[Murajah] Error loading settings:', error);
        throw error;
    }
};

/**
 * Load perfect revisions from IndexedDB
 */
export const loadPerfectRevisions = async (murajahDB) => {
    try {
        const revisions = await murajahDB.getAllPerfectRevisions();
        
        settingsStore.perfectRevisions = {};
        for (const rev of revisions) {
            settingsStore.perfectRevisions[rev.pageNumber] = rev.count;
        }
        
        console.log('[Murajah] Loaded perfect revisions for', Object.keys(settingsStore.perfectRevisions).length, 'pages');
    } catch (error) {
        console.error('[Murajah] Error loading perfect revisions:', error);
        throw error;
    }
};

/**
 * Get color for perfect revision count
 */
export const getScoreColor = (count) => {
    if (count > 90) {
        return { bg: '#4caf50', color: '#fff', label: 'Excellent', icon: 'la-star' };
    } else if (count >= 80) {
        return { bg: '#8bc34a', color: '#fff', label: 'Very Good', icon: 'la-check-circle' };
    } else if (count >= 60) {
        return { bg: '#ffc107', color: '#333', label: 'Good', icon: 'la-thumbs-up' };
    } else if (count >= 40) {
        return { bg: '#ff9800', color: '#fff', label: 'Fair', icon: 'la-circle-notch' };
    } else if (count > 0) {
        return { bg: '#ff5722', color: '#fff', label: 'Needs Work', icon: 'la-exclamation' };
    } else {
        return { bg: '#bdbdbd', color: '#666', label: 'Not Done', icon: 'la-circle' };
    }
};

/**
 * Calculate estimated completion date
 */
export const calculateEstimatedCompletion = (totalMemorized) => {
    const remaining = 604 - totalMemorized;
    if (settingsStore.pagesPerDay <= 0) return 'Never';
    
    const daysNeeded = Math.ceil(remaining / settingsStore.pagesPerDay);
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + daysNeeded);
    
    return completionDate.toLocaleDateString();
};

// Computed properties
export const perfectRevisionsCount = computed(() => 
    Object.keys(settingsStore.perfectRevisions).length
);

export const totalPerfectRevisionsPoints = computed(() => {
    let total = 0;
    for (const count of Object.values(settingsStore.perfectRevisions)) {
        total += count;
    }
    return total;
});

export const averagePerfectCount = computed(() => {
    if (perfectRevisionsCount.value === 0) return 0;
    return Math.round(totalPerfectRevisionsPoints.value / perfectRevisionsCount.value);
});
