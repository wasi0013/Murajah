/**
 * QuranPageComponent
 * 
 * Displays Quran text with interactive features:
 * - Word-by-word rendering with translations
 * - Highlight mistakes (red)
 * - Highlight memorized (green)
 * - Click word to toggle mistake
 * - Show translation tooltip on word click
 * - Responsive text sizing
 * - Tajweed rules support
 */

import { computed, ref } from 'vue';
import Logger from '../utils/logger.js';
import { appStore } from '../stores/appStore.js';
import { quranStore } from '../stores/quranStore.js';
import { memorizedStore } from '../stores/memorizedStore.js';
import { mistakesStore } from '../stores/mistakesStore.js';
import { settingsStore } from '../stores/settingsStore.js';

export const QuranPageComponent = {
  template: `
    <div class="quran-page-container w-full">
      <!-- Header: Page Info & Controls -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex flex-col">
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            {{ currentSurahName }}
          </h1>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Page {{ appStore.currentPage }} of {{ appStore.totalPages }}
            <span class="ml-2">Verse {{ firstVerse }} - {{ lastVerse }}</span>
          </p>
        </div>
        
        <!-- Page Status Badge -->
        <div class="flex gap-2 flex-wrap">
          <div 
            :class="[
              'px-3 py-1.5 rounded-full text-xs font-semibold',
              isPageMemorized 
                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
            ]"
          >
            {{ isPageMemorized ? '✓ Memorized' : 'Not Memorized' }}
          </div>
          
          <div 
            v-if="pageHasMistakes"
            :class="[
              'px-3 py-1.5 rounded-full text-xs font-semibold',
              'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
            ]"
          >
            {{ mistakeCount }} Mistakes
          </div>
        </div>
      </div>

      <!-- Quran Text Container -->
      <div 
        v-if="!quranStore.isLoaded"
        class="flex items-center justify-center h-96"
      >
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p class="text-gray-600 dark:text-gray-400">Loading Quran data...</p>
        </div>
      </div>

      <div 
        v-else
        class="quran-text-container bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 md:p-8 shadow-sm border border-gray-200 dark:border-gray-700 min-h-96"
        :class="fontSizeClass"
      >
        <!-- Basmallah (if not on page 1) -->
        <div 
          v-if="appStore.currentPage > 1 && !isFirstPageOfSurah"
          class="text-center mb-6 pb-4 border-b border-gray-300 dark:border-gray-600"
        >
          <p class="text-gray-700 dark:text-gray-300 leading-relaxed">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </p>
        </div>

        <!-- Page Lines -->
        <div 
          v-for="(line, lineIndex) in pageLines"
          :key="lineIndex"
          class="mb-4 leading-relaxed text-right"
        >
          <!-- Line Words -->
          <span 
            v-for="(word, wordIndex) in line"
            :key="`${lineIndex}-${wordIndex}`"
            class="word-token inline-block mx-1.5 relative cursor-pointer transition-all duration-200"
            :class="getWordClasses(word)"
            @click="toggleMistake(word)"
            @mouseenter="showWordTooltip(word, $event)"
            @mouseleave="hideWordTooltip"
            :title="getWordTranslation(word)"
          >
            {{ word.text }}
            
            <!-- Diacritic marks (Tajweed) -->
            <span 
              v-if="tajweedEnabled && word.tajweed"
              class="text-xs text-blue-500 dark:text-blue-400 ml-0.5"
            >
              {{ word.tajweed }}
            </span>
          </span>
        </div>
      </div>

      <!-- Word Tooltip -->
      <div 
        v-if="tooltipWord"
        class="fixed bg-gray-900 dark:bg-gray-950 text-white px-3 py-2 rounded shadow-lg text-xs z-50 pointer-events-none"
        :style="{ 
          top: tooltipPosition.y + 'px', 
          left: tooltipPosition.x + 'px',
          transform: 'translate(-50%, -100%)',
          marginTop: '-8px'
        }"
      >
        <p class="font-semibold mb-1">{{ tooltipWord.text }}</p>
        <p class="text-gray-300">{{ tooltipWord.translation }}</p>
      </div>

      <!-- Page Statistics Bar -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div class="bg-blue-50 dark:bg-blue-900 rounded-lg p-3">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">WORDS</p>
          <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ pageWordCount }}</p>
        </div>

        <div class="bg-green-50 dark:bg-green-900 rounded-lg p-3">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">MEMORIZED</p>
          <p class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ isPageMemorized ? '✓' : '○' }}
          </p>
        </div>

        <div class="bg-red-50 dark:bg-red-900 rounded-lg p-3">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">MISTAKES</p>
          <p class="text-2xl font-bold text-red-600 dark:text-red-400">{{ mistakeCount }}</p>
        </div>

        <div class="bg-purple-50 dark:bg-purple-900 rounded-lg p-3">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">PERFECT</p>
          <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ perfectRevisionCount }}
          </p>
        </div>
      </div>
    </div>
  `,

  setup() {
    // Ref for tooltip
    const tooltipWord = ref(null);
    const tooltipPosition = ref({ x: 0, y: 0 });

    // Computed properties
    const pageLines = computed(() => {
      if (!quranStore.isLoaded) return [];
      const lines = quranStore.getPageLines(appStore.currentPage);
      return lines;
    });

    const currentSurahName = computed(() => {
      if (!quranStore.isLoaded) return 'Loading...';
      return quranStore.getCurrentSurah(appStore.currentPage);
    });

    const isFirstPageOfSurah = computed(() => {
      // Simplified check - page 1 is always first of Surah Al-Fatihah
      return appStore.currentPage === 1;
    });

    const isPageMemorized = computed(() => {
      return memorizedStore.isMemorized(appStore.currentPage);
    });

    const pageHasMistakes = computed(() => {
      const mistakes = mistakesStore.getPageMistakes(appStore.currentPage);
      return mistakes && mistakes.size > 0;
    });

    const mistakeCount = computed(() => {
      const mistakes = mistakesStore.getPageMistakes(appStore.currentPage);
      return mistakes ? mistakes.size : 0;
    });

    const pageWordCount = computed(() => {
      return pageLines.value.reduce((total, line) => total + line.length, 0);
    });

    const perfectRevisionCount = computed(() => {
      return settingsStore.getPerfectCount(appStore.currentPage);
    });

    const firstVerse = computed(() => {
      // Simplified - would need verse mapping
      return `${appStore.currentPage}:1`;
    });

    const lastVerse = computed(() => {
      // Simplified - would need verse mapping
      return `${appStore.currentPage}:${pageWordCount.value}`;
    });

    const fontSizeClass = computed(() => {
      const fontSize = settingsStore.fontSize;
      return {
        'text-sm': fontSize === 'small',
        'text-base': fontSize === 'medium',
        'text-lg': fontSize === 'large',
        'leading-relaxed': fontSize === 'small',
        'leading-loose': fontSize === 'medium' || fontSize === 'large',
      };
    });

    const tajweedEnabled = computed(() => settingsStore.tajweedEnabled);

    // Methods
    const getWordClasses = (word) => {
      const isMistake = mistakesStore.isMistake(appStore.currentPage, word.id);
      const isMemorized = isPageMemorized.value;

      return {
        'text-red-600 dark:text-red-400 font-semibold bg-red-50 dark:bg-red-900 bg-opacity-30 px-1 py-0.5 rounded': isMistake,
        'text-green-700 dark:text-green-300': isMemorized && !isMistake,
        'hover:bg-blue-100 dark:hover:bg-blue-900 hover:bg-opacity-30': !isMistake,
        'text-gray-800 dark:text-gray-200': !isMistake && !isMemorized,
      };
    };

    const toggleMistake = (word) => {
      try {
        mistakesStore.toggleMistake(appStore.currentPage, word.id);
        Logger.debug(Logger.MODULES.UI, `Toggled mistake for word ${word.id}`);
      } catch (error) {
        Logger.error(Logger.MODULES.UI, 'Error toggling mistake', error);
      }
    };

    const getWordTranslation = (word) => {
      if (!word.id) return '';
      try {
        return quranStore.getWordTranslation(word.id) || 'No translation';
      } catch (error) {
        Logger.error(Logger.MODULES.UI, 'Error getting translation', error);
        return 'Translation unavailable';
      }
    };

    const showWordTooltip = (word, event) => {
      tooltipWord.value = {
        text: word.text,
        translation: getWordTranslation(word),
      };
      tooltipPosition.value = {
        x: event.clientX,
        y: event.clientY,
      };
    };

    const hideWordTooltip = () => {
      tooltipWord.value = null;
    };

    return {
      // Computed
      pageLines,
      currentSurahName,
      isFirstPageOfSurah,
      isPageMemorized,
      pageHasMistakes,
      mistakeCount,
      pageWordCount,
      perfectRevisionCount,
      firstVerse,
      lastVerse,
      fontSizeClass,
      tajweedEnabled,
      
      // Refs
      tooltipWord,
      tooltipPosition,
      
      // Methods
      getWordClasses,
      toggleMistake,
      getWordTranslation,
      showWordTooltip,
      hideWordTooltip,
      
      // Stores
      appStore,
      quranStore,
      memorizedStore,
      mistakesStore,
      settingsStore,
    };
  }
};
