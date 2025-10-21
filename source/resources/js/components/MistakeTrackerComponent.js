/**
 * MistakeTrackerComponent
 * 
 * Visual grid showing word-level mistakes:
 * - Bubble grid for each page with mistakes
 * - Click bubble to navigate to page
 * - Color coded by mistake count
 * - Sortable by page or mistake count
 */

import { computed, ref } from 'vue';
import { mistakesStore } from '../stores/mistakesStore.js';
import { appStore } from '../stores/appStore.js';

export const MistakeTrackerComponent = {
  template: `
    <div class="mistake-tracker-container">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Mistake Tracker</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {{ pagesWithMistakes.length }} pages with {{ mistakesStore.totalMistakes }} total mistakes
          </p>
        </div>

        <!-- Sort Controls -->
        <div class="flex gap-2">
          <button
            @click="sortBy = 'page'"
            :class="[
              'px-4 py-2 rounded-lg font-semibold transition-all duration-200',
              sortBy === 'page'
                ? 'bg-blue-500 dark:bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
            ]"
          >
            By Page
          </button>
          <button
            @click="sortBy = 'count'"
            :class="[
              'px-4 py-2 rounded-lg font-semibold transition-all duration-200',
              sortBy === 'count'
                ? 'bg-blue-500 dark:bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
            ]"
          >
            By Count
          </button>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="pagesWithMistakes.length === 0" class="text-center py-12">
        <div class="text-6xl mb-4">🎉</div>
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Perfect!</h3>
        <p class="text-gray-600 dark:text-gray-400">No mistakes recorded. Keep up the great work!</p>
      </div>

      <!-- Bubble Grid (if mistakes exist) -->
      <div v-else class="space-y-6">
        <!-- Statistics -->
        <div class="grid grid-cols-3 gap-4">
          <div class="bg-red-50 dark:bg-red-900 rounded-lg p-4 border border-red-200 dark:border-red-800">
            <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">PAGES WITH MISTAKES</p>
            <p class="text-3xl font-bold text-red-600 dark:text-red-400">{{ pagesWithMistakes.length }}</p>
          </div>

          <div class="bg-orange-50 dark:bg-orange-900 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">TOTAL MISTAKES</p>
            <p class="text-3xl font-bold text-orange-600 dark:text-orange-400">{{ mistakesStore.totalMistakes }}</p>
          </div>

          <div class="bg-yellow-50 dark:bg-yellow-900 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
            <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">AVG PER PAGE</p>
            <p class="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{{ avgMistakesPerPage }}</p>
          </div>
        </div>

        <!-- Bubble Grid -->
        <div class="flex flex-wrap gap-3 justify-center p-6 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <div
            v-for="pageData in sortedPages"
            :key="pageData.page"
            class="relative group cursor-pointer transition-all duration-200 hover:scale-110"
            @click="navigateToPage(pageData.page)"
          >
            <!-- Bubble -->
            <div
              class="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-full font-bold text-white transition-all duration-200"
              :class="getBubbleColor(pageData.mistakes)"
              :style="{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }"
            >
              <div class="text-center">
                <div class="text-lg sm:text-xl font-bold">{{ pageData.page }}</div>
                <div class="text-xs">{{ pageData.mistakes }}</div>
              </div>
            </div>

            <!-- Tooltip -->
            <div
              class="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 rounded shadow-lg text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none bg-gray-900 dark:bg-gray-950 text-white z-10"
            >
              Page {{ pageData.page }}: {{ pageData.mistakes }} mistakes
              <div class="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-950"></div>
            </div>
          </div>
        </div>

        <!-- Detailed List -->
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="bg-gray-100 dark:bg-gray-700 px-6 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 class="font-bold text-gray-900 dark:text-white">Mistake Details</h3>
          </div>

          <div class="max-h-96 overflow-y-auto">
            <div
              v-for="(pageData, index) in sortedPages"
              :key="pageData.page"
              class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              @click="navigateToPage(pageData.page)"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <p class="font-semibold text-gray-900 dark:text-white">Page {{ pageData.page }}</p>
                  <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {{ pageData.mistakes }} word{{ pageData.mistakes === 1 ? '' : 's' }} with mistakes
                  </p>
                </div>

                <div class="flex items-center gap-3">
                  <div :class="['px-3 py-1 rounded-full text-sm font-semibold', getBubbleColorClass(pageData.mistakes)]">
                    {{ pageData.mistakes }}
                  </div>
                  <span class="text-lg text-gray-400 dark:text-gray-600">→</span>
                </div>
              </div>

              <!-- Mistake Words Preview -->
              <div v-if="pageData.mistakes <= 5" class="mt-2 flex flex-wrap gap-1">
                <span
                  v-for="(wordId, idx) in getPageMistakeWords(pageData.page).slice(0, 5)"
                  :key="idx"
                  class="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-2 py-1 rounded"
                >
                  Word {{ wordId }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Legend -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-red-600"></div>
            <span class="text-xs text-gray-600 dark:text-gray-400">5+</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-orange-500"></div>
            <span class="text-xs text-gray-600 dark:text-gray-400">3-4</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-yellow-500"></div>
            <span class="text-xs text-gray-600 dark:text-gray-400">2</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-blue-500"></div>
            <span class="text-xs text-gray-600 dark:text-gray-400">1</span>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const sortBy = ref('count'); // 'page' or 'count'

    const pagesWithMistakes = computed(() => {
      return mistakesStore.getPagesWithMistakes();
    });

    const avgMistakesPerPage = computed(() => {
      if (pagesWithMistakes.value.length === 0) return 0;
      const total = pagesWithMistakes.value.reduce(
        (sum, p) => sum + p.mistakes,
        0
      );
      return (total / pagesWithMistakes.value.length).toFixed(1);
    });

    const sortedPages = computed(() => {
      if (sortBy.value === 'page') {
        return [...pagesWithMistakes.value].sort((a, b) => a.page - b.page);
      } else {
        return [...pagesWithMistakes.value].sort(
          (a, b) => b.mistakes - a.mistakes
        );
      }
    });

    const getBubbleColor = (count) => {
      if (count >= 5) return 'bg-red-600 dark:bg-red-700';
      if (count >= 3) return 'bg-orange-500 dark:bg-orange-600';
      if (count === 2) return 'bg-yellow-500 dark:bg-yellow-600';
      return 'bg-blue-500 dark:bg-blue-600';
    };

    const getBubbleColorClass = (count) => {
      if (count >= 5)
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      if (count >= 3)
        return 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200';
      if (count === 2)
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200';
      return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
    };

    const navigateToPage = (page) => {
      appStore.setCurrentPage(page);
    };

    const getPageMistakeWords = (page) => {
      const mistakes = mistakesStore.getPageMistakes(page);
      if (!mistakes) return [];
      return Array.from(mistakes);
    };

    return {
      sortBy,
      pagesWithMistakes,
      mistakesStore,
      appStore,
      avgMistakesPerPage,
      sortedPages,
      getBubbleColor,
      getBubbleColorClass,
      navigateToPage,
      getPageMistakeWords,
    };
  }
};
