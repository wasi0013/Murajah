/**
 * App Store - Central application state
 * Manages: current page, theme, loading states, app version
 */

import { reactive, computed } from 'vue';

export const appStore = reactive({
    currentPage: 1,
    totalPages: 604,
    isLoading: true,
    theme: 'light', // 'light' | 'dark'
    appVersion: '2.0.0-beta',
    errorMessage: '',
    successMessage: ''
});

export const setCurrentPage = (page) => {
    const validPage = Math.max(1, Math.min(page, appStore.totalPages));
    appStore.currentPage = validPage;
    
    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('page', validPage);
    window.history.replaceState({}, '', url.toString());
};

export const setTheme = (theme) => {
    appStore.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
};

export const setError = (message) => {
    appStore.errorMessage = message;
    console.error('[Murajah]', message);
    setTimeout(() => {
        appStore.errorMessage = '';
    }, 5000);
};

export const setSuccess = (message) => {
    appStore.successMessage = message;
    console.log('[Murajah]', message);
    setTimeout(() => {
        appStore.successMessage = '';
    }, 3000);
};

export const initAppStore = async (murajahDB) => {
    try {
        // Load theme from IndexedDB
        const savedTheme = await murajahDB.getSetting('theme', 'light');
        setTheme(savedTheme);

        // Get page from URL
        const url = new URL(window.location);
        const pageParam = parseInt(url.searchParams.get('page') || '1', 10);
        setCurrentPage(pageParam);

        appStore.isLoading = false;
        console.log('[Murajah] App store initialized');
    } catch (error) {
        setError('Failed to initialize app: ' + error.message);
    }
};

// Computed properties
export const pagePercent = computed(() => 
    (appStore.currentPage / appStore.totalPages) * 100
);

export const isPreviousDisabled = computed(() => 
    appStore.currentPage === 1
);

export const isNextDisabled = computed(() => 
    appStore.currentPage === appStore.totalPages
);
