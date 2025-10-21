/**
 * NavigationComponent
 * 
 * Page navigation controls:
 * - Previous page button
 * - Next page button
 * - Go to page input
 * - Page counter display
 * - Keyboard shortcuts
 * - Disabled states for first/last page
 */

import { computed } from 'vue';
import { appStore } from '../stores/appStore.js';

export const NavigationComponent = {
  template: `
    <div class="navigation-container">
      <!-- Desktop: Horizontal Layout -->
      <div class="hidden sm:flex items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <!-- Previous Button -->
        <button
          @click="goToPreviousPage"
          :disabled="appStore.isPreviousDisabled"
          class="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200"
          :class="[
            appStore.isPreviousDisabled
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-600 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white active:scale-95'
          ]"
          title="Previous page (← or P)"
        >
          <span class="text-lg">←</span>
          <span>Previous</span>
        </button>

        <!-- Page Counter & Input -->
        <div class="flex items-center gap-3">
          <div class="text-center">
            <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-1">CURRENT PAGE</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ appStore.currentPage }}</p>
          </div>

          <div class="px-3 py-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
            of
          </div>

          <div class="text-center">
            <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-1">TOTAL</p>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ appStore.totalPages }}</p>
          </div>
        </div>

        <!-- Go to Page Input -->
        <div class="flex items-center gap-2">
          <input
            v-model.number="gotoPageInput"
            type="number"
            min="1"
            :max="appStore.totalPages"
            @keydown.enter="goToPage"
            placeholder="Go to page"
            class="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            @click="goToPage"
            class="px-4 py-2 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg font-semibold transition-all duration-200 active:scale-95"
            title="Go to specified page (Enter)"
          >
            Go
          </button>
        </div>

        <!-- Next Button -->
        <button
          @click="goToNextPage"
          :disabled="appStore.isNextDisabled"
          class="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200"
          :class="[
            appStore.isNextDisabled
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-600 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white active:scale-95'
          ]"
          title="Next page (→ or N)"
        >
          <span>Next</span>
          <span class="text-lg">→</span>
        </button>
      </div>

      <!-- Mobile: Vertical Layout -->
      <div class="sm:hidden flex flex-col gap-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <!-- Page Counter -->
        <div class="text-center">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold mb-1">Page {{ appStore.currentPage }} of {{ appStore.totalPages }}</p>
          <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ appStore.currentPage }}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ progressPercent }}% Complete</p>
        </div>

        <!-- Progress Bar -->
        <div class="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            class="bg-blue-500 dark:bg-blue-400 h-full transition-all duration-300"
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>

        <!-- Previous / Next Buttons -->
        <div class="flex gap-3">
          <button
            @click="goToPreviousPage"
            :disabled="appStore.isPreviousDisabled"
            class="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg font-semibold transition-all duration-200 touch-target"
            :class="[
              appStore.isPreviousDisabled
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-600 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white active:scale-95'
            ]"
            title="Previous page"
          >
            <span class="text-xl">←</span>
            <span class="hidden xs:inline">Prev</span>
          </button>

          <button
            @click="goToNextPage"
            :disabled="appStore.isNextDisabled"
            class="flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-lg font-semibold transition-all duration-200 touch-target"
            :class="[
              appStore.isNextDisabled
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-600 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white active:scale-95'
            ]"
            title="Next page"
          >
            <span class="hidden xs:inline">Next</span>
            <span class="text-xl">→</span>
          </button>
        </div>

        <!-- Go to Page Input -->
        <div class="flex gap-2">
          <input
            v-model.number="gotoPageInput"
            type="number"
            min="1"
            :max="appStore.totalPages"
            @keydown.enter="goToPage"
            placeholder="Jump to..."
            class="flex-1 px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
          />
          <button
            @click="goToPage"
            class="px-4 py-2.5 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg font-semibold transition-all duration-200 active:scale-95 touch-target"
            title="Go to page"
          >
            <span class="hidden xs:inline">Go</span>
            <span class="xs:hidden">→</span>
          </button>
        </div>
      </div>

      <!-- Progress Stats -->
      <div class="hidden md:grid grid-cols-4 gap-3 mt-4">
        <div class="bg-blue-50 dark:bg-blue-900 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">PAGES</p>
          <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ appStore.currentPage }}/{{ appStore.totalPages }}</p>
        </div>
        <div class="bg-green-50 dark:bg-green-900 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">PROGRESS</p>
          <p class="text-2xl font-bold text-green-600 dark:text-green-400">{{ progressPercent }}%</p>
        </div>
        <div class="bg-purple-50 dark:bg-purple-900 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">REMAINING</p>
          <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">{{ remainingPages }}</p>
        </div>
        <div class="bg-orange-50 dark:bg-orange-900 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">JUZS</p>
          <p class="text-2xl font-bold text-orange-600 dark:text-orange-400">{{ currentJuz }}/30</p>
        </div>
      </div>
    </div>
  `,

  setup() {
    let gotoPageInput = 1;

    const progressPercent = computed(() => {
      return Math.round((appStore.currentPage / appStore.totalPages) * 100);
    });

    const remainingPages = computed(() => {
      return appStore.totalPages - appStore.currentPage;
    });

    const currentJuz = computed(() => {
      return Math.ceil(appStore.currentPage / 20);
    });

    const goToPreviousPage = () => {
      if (!appStore.isPreviousDisabled) {
        appStore.setCurrentPage(appStore.currentPage - 1);
      }
    };

    const goToNextPage = () => {
      if (!appStore.isNextDisabled) {
        appStore.setCurrentPage(appStore.currentPage + 1);
      }
    };

    const goToPage = () => {
      const pageNum = parseInt(gotoPageInput);
      if (pageNum >= 1 && pageNum <= appStore.totalPages) {
        appStore.setCurrentPage(pageNum);
        gotoPageInput = '';
      } else {
        alert(`Please enter a page number between 1 and ${appStore.totalPages}`);
      }
    };

    // Keyboard shortcuts
    const handleKeyboard = (event) => {
      if (event.target.tagName === 'INPUT' && event.key !== 'Enter') return;

      switch (event.key) {
        case 'ArrowLeft':
        case 'p':
        case 'P':
          goToPreviousPage();
          event.preventDefault();
          break;
        case 'ArrowRight':
        case 'n':
        case 'N':
          goToNextPage();
          event.preventDefault();
          break;
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyboard);
    }

    return {
      gotoPageInput,
      progressPercent,
      remainingPages,
      currentJuz,
      goToPreviousPage,
      goToNextPage,
      goToPage,
      appStore,
    };
  }
};
