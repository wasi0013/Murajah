/**
 * MemorizedGridComponent
 * 
 * Visual grid of all 604 pages showing:
 * - Green for memorized pages
 * - Gray for not memorized
 * - Click to toggle memorization
 * - Color coded by Juz
 */

import { computed } from 'vue';
import { memorizedStore } from '../stores/memorizedStore.js';
import { appStore } from '../stores/appStore.js';

export const MemorizedGridComponent = {
  template: `
    <div class="memorized-grid-container">
      <!-- Header -->
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Memorization Grid</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {{ memorizedStore.memorizedCount }} of {{ appStore.totalPages }} pages memorized ({{ memorizedPercentage }}%)
        </p>
      </div>

      <!-- Statistics -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-green-50 dark:bg-green-900 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">MEMORIZED</p>
          <p class="text-3xl font-bold text-green-600 dark:text-green-400">{{ memorizedStore.memorizedCount }}</p>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">REMAINING</p>
          <p class="text-3xl font-bold text-gray-600 dark:text-gray-400">{{ remainingCount }}</p>
        </div>
        <div class="bg-blue-50 dark:bg-blue-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">JUZS FULL</p>
          <p class="text-3xl font-bold text-blue-600 dark:text-blue-400">{{ completeJuzs }}/30</p>
        </div>
        <div class="bg-purple-50 dark:bg-purple-900 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">PROGRESS</p>
          <p class="text-3xl font-bold text-purple-600 dark:text-purple-400">{{ memorizedPercentage }}%</p>
        </div>
      </div>

      <!-- Grid by Juz -->
      <div class="space-y-6">
        <div v-for="juz in 30" :key="juz" class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <!-- Juz Header -->
          <div class="flex justify-between items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
            <h3 class="font-bold text-gray-900 dark:text-white">
              Juz {{ juz }}
              <span class="text-xs text-gray-600 dark:text-gray-400 font-normal">
                ({{ getJuzMemorizedCount(juz) }}/{{ getJuzPageCount(juz) }})
              </span>
            </h3>
            <div class="flex gap-2">
              <button
                @click="bulkMarkJuz(juz, true)"
                class="px-3 py-1 text-xs bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded font-semibold transition-colors"
                title="Mark all pages in this Juz as memorized"
              >
                Mark All
              </button>
              <button
                @click="bulkMarkJuz(juz, false)"
                class="px-3 py-1 text-xs bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white rounded font-semibold transition-colors"
                title="Mark all pages in this Juz as not memorized"
              >
                Clear
              </button>
            </div>
          </div>

          <!-- Pages Grid -->
          <div class="grid grid-cols-10 sm:grid-cols-15 gap-1">
            <button
              v-for="page in getJuzPages(juz)"
              :key="page"
              @click="toggleMemorized(page)"
              class="aspect-square flex items-center justify-center rounded text-xs font-bold transition-all duration-200 hover:scale-110 cursor-pointer"
              :class="memorizedStore.isMemorized(page) ? 'bg-green-500 dark:bg-green-600 text-white hover:bg-green-600' : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-400'"
              :title="`Page ${page}: ${memorizedStore.isMemorized(page) ? 'Memorized' : 'Not memorized'}`"
            >
              {{ page }}
            </button>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="mt-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex gap-4">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded bg-green-500"></div>
          <span class="text-sm text-gray-700 dark:text-gray-300">Memorized</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded bg-gray-300 dark:bg-gray-600"></div>
          <span class="text-sm text-gray-700 dark:text-gray-300">Not Memorized</span>
        </div>
      </div>
    </div>
  `,

  setup() {
    const memorizedPercentage = computed(() => {
      return Math.round((memorizedStore.memorizedCount / appStore.totalPages) * 100);
    });

    const remainingCount = computed(() => {
      return appStore.totalPages - memorizedStore.memorizedCount;
    });

    const completeJuzs = computed(() => {
      let count = 0;
      for (let i = 1; i <= 30; i++) {
        const startPage = (i - 1) * 20 + 1;
        const endPage = Math.min(i * 20, appStore.totalPages);
        
        let juzComplete = true;
        for (let page = startPage; page <= endPage; page++) {
          if (!memorizedStore.isMemorized(page)) {
            juzComplete = false;
            break;
          }
        }
        
        if (juzComplete) count++;
      }
      return count;
    });

    const getJuzPageCount = (juz) => {
      const startPage = (juz - 1) * 20 + 1;
      const endPage = Math.min(juz * 20, appStore.totalPages);
      return endPage - startPage + 1;
    };

    const getJuzMemorizedCount = (juz) => {
      const startPage = (juz - 1) * 20 + 1;
      const endPage = Math.min(juz * 20, appStore.totalPages);
      
      let count = 0;
      for (let page = startPage; page <= endPage; page++) {
        if (memorizedStore.isMemorized(page)) count++;
      }
      return count;
    };

    const getJuzPages = (juz) => {
      const startPage = (juz - 1) * 20 + 1;
      const endPage = Math.min(juz * 20, appStore.totalPages);
      
      const pages = [];
      for (let page = startPage; page <= endPage; page++) {
        pages.push(page);
      }
      return pages;
    };

    const toggleMemorized = (page) => {
      memorizedStore.toggleMemorized(page);
    };

    const bulkMarkJuz = (juz, memorized) => {
      const pages = getJuzPages(juz);
      if (memorized) {
        memorizedStore.bulkMarkMemorized(pages);
      } else {
        memorizedStore.bulkUnmarkMemorized(pages);
      }
    };

    return {
      memorizedStore,
      appStore,
      memorizedPercentage,
      remainingCount,
      completeJuzs,
      getJuzPageCount,
      getJuzMemorizedCount,
      getJuzPages,
      toggleMemorized,
      bulkMarkJuz,
    };
  }
};
