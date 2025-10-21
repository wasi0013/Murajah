/**
 * INTEGRATION GUIDE - Phase 4-9 Components
 * 
 * This guide shows how to integrate all 8 Vue components into beta.html
 * and create a tabbed interface for accessing different features.
 */

// ============================================
// STEP 1: Import all components in beta.html
// ============================================

// Add these imports to the <script> section of beta.html:

import { QuranPageComponent } from './resources/js/components/QuranPageComponent.js';
import { NavigationComponent } from './resources/js/components/NavigationComponent.js';
import { StatusIndicatorsComponent } from './resources/js/components/StatusIndicatorsComponent.js';
import { DashboardComponent } from './resources/js/components/DashboardComponent.js';
import { MistakeTrackerComponent } from './resources/js/components/MistakeTrackerComponent.js';
import { MemorizedGridComponent } from './resources/js/components/MemorizedGridComponent.js';
import { AudioPlaylistComponent } from './resources/js/components/AudioPlaylistComponent.js';
import { SettingsComponent } from './resources/js/components/SettingsComponent.js';

// ============================================
// STEP 2: Create a TabsComponent to manage views
// ============================================

const TabsComponent = {
  template: `
    <div class="tabs-container">
      <!-- Tab Navigation -->
      <div class="flex gap-2 mb-4 overflow-x-auto border-b border-gray-200 dark:border-gray-700 pb-2">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2 font-semibold whitespace-nowrap transition-all duration-200 rounded-t-lg',
            activeTab === tab.id
              ? 'bg-blue-500 dark:bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
          ]"
        >
          {{ tab.icon }} {{ tab.label }}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content">
        <component 
          :is="getCurrentComponent" 
          :key="activeTab"
        ></component>
      </div>
    </div>
  `,

  components: {
    QuranPageComponent,
    NavigationComponent,
    StatusIndicatorsComponent,
    DashboardComponent,
    MistakeTrackerComponent,
    MemorizedGridComponent,
    AudioPlaylistComponent,
    SettingsComponent,
  },

  setup() {
    const activeTab = ref('quran');

    const tabs = [
      { id: 'quran', label: 'Quran', icon: '📖', component: 'QuranPageComponent' },
      { id: 'dashboard', label: 'Dashboard', icon: '📊', component: 'DashboardComponent' },
      { id: 'mistakes', label: 'Mistakes', icon: '✕', component: 'MistakeTrackerComponent' },
      { id: 'memorized', label: 'Grid', icon: '🟩', component: 'MemorizedGridComponent' },
      { id: 'audio', label: 'Audio', icon: '🎤', component: 'AudioPlaylistComponent' },
      { id: 'indicators', label: 'Stats', icon: '📈', component: 'StatusIndicatorsComponent' },
      { id: 'settings', label: 'Settings', icon: '⚙️', component: 'SettingsComponent' },
    ];

    const getCurrentComponent = computed(() => {
      const tab = tabs.find(t => t.id === activeTab.value);
      return tab?.component || 'QuranPageComponent';
    });

    return {
      activeTab,
      tabs,
      getCurrentComponent,
    };
  }
};

// ============================================
// STEP 3: Update beta.html main layout
// ============================================

// Replace the main content area in beta.html with:

<div class="main-content flex-1 overflow-y-auto">
  <!-- Header -->
  <div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Murajah</h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">Quran Memorization Helper</p>
      </div>
      
      <!-- Quick Actions -->
      <div class="flex gap-2">
        <button 
          @click="memorizedStore.toggleMemorized(appStore.currentPage)"
          :class="[
            'px-4 py-2 rounded-lg font-semibold transition-all',
            memorizedStore.isMemorized(appStore.currentPage)
              ? 'bg-green-500 hover:bg-green-600 dark:bg-green-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
          ]"
          title="Toggle memorization for current page"
        >
          {{ memorizedStore.isMemorized(appStore.currentPage) ? '✓ Memorized' : 'Mark Memorized' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Navigation (Sticky below header) -->
  <div class="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-16 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <NavigationComponent></NavigationComponent>
    </div>
  </div>

  <!-- Main Content with Tabs -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    <TabsComponent></TabsComponent>
  </div>
</div>

// ============================================
// STEP 4: Update App.vue or main component
// ============================================

// The main app component should look like:

{
  template: `
    <div class="app-container h-screen flex flex-col bg-white dark:bg-gray-900">
      <!-- Header (already has theme toggle) -->
      <header>...</header>

      <!-- Main Content Area -->
      <TabsComponent></TabsComponent>

      <!-- Footer -->
      <footer>...</footer>
    </div>
  `,

  components: {
    TabsComponent,
  },

  setup() {
    // Initialize app on mount
    onMounted(async () => {
      try {
        const murajahDB = new MurajahDB();
        await murajahDB.init();
        await appStore.initAppStore(murajahDB);
        await quranStore.loadQuranData();
        await memorizedStore.loadMemorizedPages(murajahDB);
        await mistakesStore.loadMistakes(murajahDB);
        await audioStore.loadAudioRecordings(murajahDB);
        await settingsStore.loadSettings(murajahDB);
      } catch (error) {
        console.error('[Murajah] Initialization error:', error);
        appStore.setError('Failed to initialize app: ' + error.message);
      }
    });

    return {
      appStore,
    };
  }
}

// ============================================
// STEP 5: Component Relationship Diagram
// ============================================

/**
 * Hierarchy:
 * 
 * App
 * ├── Header (theme, app title)
 * └── TabsComponent
 *     ├── [QuranPageComponent]
 *     │   ├── Uses: appStore, quranStore, memorizedStore, mistakesStore, settingsStore
 *     │   └── Features: word rendering, click to mark mistakes, tooltips
 *     │
 *     ├── [DashboardComponent]
 *     │   ├── Uses: memorizedStore, mistakesStore, settingsStore, appStore
 *     │   └── Features: progress, Juz grid, top pages, goal settings
 *     │
 *     ├── [MistakeTrackerComponent]
 *     │   ├── Uses: mistakesStore, appStore
 *     │   └── Features: bubble grid, sorting, detailed list
 *     │
 *     ├── [MemorizedGridComponent]
 *     │   ├── Uses: memorizedStore, appStore
 *     │   └── Features: grid by Juz, bulk operations
 *     │
 *     ├── [AudioPlaylistComponent]
 *     │   ├── Uses: audioStore, appStore
 *     │   └── Features: recording, playback, management
 *     │
 *     ├── [StatusIndicatorsComponent]
 *     │   ├── Uses: memorizedStore, mistakesStore, settingsStore, appStore
 *     │   └── Features: stat cards, progress bars
 *     │
 *     ├── [SettingsComponent]
 *     │   ├── Uses: appStore, settingsStore, all stores (for export/import)
 *     │   └── Features: theme, export/import, reset
 *     │
 *     └── [NavigationComponent] (moved to header area)
 *         ├── Uses: appStore
 *         └── Features: page controls, keyboard shortcuts
 */

// ============================================
// STEP 6: Data Flow
// ============================================

/**
 * User Action → Component Event → Store Method → IndexedDB Update → Reactive UI Update
 * 
 * Example: Mark page as memorized
 * ────────────────────────────────
 * 1. User clicks "Mark Memorized" in QuranPage
 * 2. Component calls: memorizedStore.toggleMemorized(appStore.currentPage)
 * 3. Store updates reactive state: memorizedStore.memorizedPages.add(pageNum)
 * 4. Store persists to IndexedDB: await murajahDB.addMemorized(pageNum)
 * 5. UI automatically updates via computed properties
 * 6. All related components reactively update (Dashboard, StatusIndicators, etc.)
 * 
 * This happens automatically through Vue's reactivity system!
 */

// ============================================
// STEP 7: Testing Checklist
// ============================================

/**
 * Before shipping to production:
 * 
 * ✓ Page Navigation
 *   - [ ] Previous/Next buttons work
 *   - [ ] Go to page input works
 *   - [ ] Keyboard shortcuts work (arrow keys, P/N)
 *   - [ ] URL updates with page parameter
 * 
 * ✓ Memorization
 *   - [ ] Can mark page as memorized
 *   - [ ] Can unmark memorized page
 *   - [ ] Stats update instantly
 *   - [ ] Data persists on reload
 * 
 * ✓ Mistakes
 *   - [ ] Can click word to mark mistake
 *   - [ ] Mistake is highlighted in red
 *   - [ ] Can view all pages with mistakes
 *   - [ ] Can sort by page or count
 * 
 * ✓ Audio
 *   - [ ] Recording button works
 *   - [ ] Countdown appears before recording
 *   - [ ] Recording saves
 *   - [ ] Can play back recording
 *   - [ ] Can delete recording
 * 
 * ✓ Dashboard
 *   - [ ] Progress bar shows correct percentage
 *   - [ ] Juz grid shows correct colors
 *   - [ ] Can click Juz to navigate
 *   - [ ] Top pages list updates
 * 
 * ✓ Settings
 *   - [ ] Theme toggle works
 *   - [ ] Font size changes apply
 *   - [ ] Can export data
 *   - [ ] Can import data
 *   - [ ] Data persists
 * 
 * ✓ Responsive
 *   - [ ] Mobile layout (320px)
 *   - [ ] Tablet layout (768px)
 *   - [ ] Desktop layout (1200px)
 *   - [ ] Touch targets are 44x44px
 * 
 * ✓ Performance
 *   - [ ] Page loads in < 2 seconds
 *   - [ ] Interactions respond in < 100ms
 *   - [ ] Animations run at 60 FPS
 *   - [ ] No console errors
 */

// ============================================
// STEP 8: Keyboard Shortcuts
// ============================================

/**
 * Arrow Left / P → Previous page
 * Arrow Right / N → Next page
 * Ctrl+S → Export data
 * Ctrl+O → Import data
 * Ctrl+M → Mark/unmark current page as memorized
 * 
 * (Can be added to SettingsComponent or as global shortcuts)
 */

// ============================================
// STEP 9: Performance Optimization Tips
// ============================================

/**
 * 1. Lazy load components in tabs:
 *    const QuranPageComponent = defineAsyncComponent(() => 
 *      import('./components/QuranPageComponent.js')
 *    );
 * 
 * 2. Cache Quran data after first load
 *    (already done in quranStore)
 * 
 * 3. Use v-show instead of v-if for frequently toggled elements
 * 
 * 4. Debounce frequent state updates
 * 
 * 5. Use virtual scrolling for long lists (if needed)
 */

// ============================================
// STEP 10: Next Phase Tasks
// ============================================

/**
 * Phase 10-11: Responsive Design
 * - [ ] Test on actual mobile devices
 * - [ ] Adjust padding/margins for mobile
 * - [ ] Optimize grid layouts
 * - [ ] Verify touch interactions
 * - [ ] Add animations
 * - [ ] Performance profiling
 * 
 * Phase 12-14: Testing & QA
 * - [ ] Browser compatibility testing
 * - [ ] Accessibility audit
 * - [ ] Performance testing
 * - [ ] Data migration testing
 * - [ ] Bug fixes and optimization
 */
