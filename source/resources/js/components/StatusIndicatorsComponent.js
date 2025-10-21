/**
 * StatusIndicatorsComponent
 * 
 * Quick stats display showing:
 * - Total memorized pages count & percentage
 * - Total mistakes count
 * - Perfect revisions count & score
 * - Overall progress status
 */

import { computed } from 'vue';
import { memorizedStore } from '../stores/memorizedStore.js';
import { mistakesStore } from '../stores/mistakesStore.js';
import { settingsStore } from '../stores/settingsStore.js';
import { appStore } from '../stores/appStore.js';

export const StatusIndicatorsComponent = {
  template: `
    <div class="status-indicators-container">
      <!-- Main Stats Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <!-- Memorized Stats -->
        <div class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900 dark:to-emerald-900 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-gray-700 dark:text-gray-300">MEMORIZED</p>
            <span class="text-xl">✓</span>
          </div>
          <p class="text-3xl font-bold text-green-600 dark:text-green-400">{{ memorizedStore.memorizedCount }}</p>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">{{ memorizedPercentage }}% of Quran</p>
          <div class="w-full bg-green-300 dark:bg-green-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              class="bg-green-600 dark:bg-green-400 h-full transition-all duration-500"
              :style="{ width: memorizedPercentage + '%' }"
            ></div>
          </div>
        </div>

        <!-- Mistakes Stats -->
        <div class="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900 dark:to-rose-900 rounded-lg p-4 border border-red-200 dark:border-red-800">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-gray-700 dark:text-gray-300">MISTAKES</p>
            <span class="text-xl">✕</span>
          </div>
          <p class="text-3xl font-bold text-red-600 dark:text-red-400">{{ mistakesStore.totalMistakes }}</p>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">{{ pagesWithMistakes }} pages</p>
          <div class="w-full bg-red-300 dark:bg-red-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              class="bg-red-600 dark:bg-red-400 h-full transition-all duration-500"
              :style="{ width: mistakeRatio + '%' }"
            ></div>
          </div>
        </div>

        <!-- Perfect Revisions Stats -->
        <div class="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900 dark:to-violet-900 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-gray-700 dark:text-gray-300">PERFECT</p>
            <span class="text-xl">★</span>
          </div>
          <p class="text-3xl font-bold text-purple-600 dark:text-purple-400">{{ settingsStore.perfectRevisionsCount }}</p>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">{{ perfectScore }} points</p>
          <div class="w-full bg-purple-300 dark:bg-purple-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              class="bg-purple-600 dark:bg-purple-400 h-full transition-all duration-500"
              :style="{ width: Math.min(perfectScore / 100 * 100, 100) + '%' }"
            ></div>
          </div>
        </div>

        <!-- Juz Stats -->
        <div class="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900 dark:to-cyan-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-gray-700 dark:text-gray-300">JUZS</p>
            <span class="text-xl">📖</span>
          </div>
          <p class="text-3xl font-bold text-blue-600 dark:text-blue-400">{{ currentJuz }}/30</p>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">{{ memorizedJuzs }} memorized</p>
          <div class="w-full bg-blue-300 dark:bg-blue-800 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              class="bg-blue-600 dark:bg-blue-400 h-full transition-all duration-500"
              :style="{ width: juzProgress + '%' }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Secondary Stats (Hidden on Mobile) -->
      <div class="hidden sm:grid grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
        <div class="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <p class="text-gray-600 dark:text-gray-400 font-semibold mb-1">PAGES</p>
          <p class="text-lg font-bold text-gray-900 dark:text-white">{{ appStore.totalPages }}</p>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <p class="text-gray-600 dark:text-gray-400 font-semibold mb-1">REMAINING</p>
          <p class="text-lg font-bold text-gray-900 dark:text-white">{{ remainingPages }}</p>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <p class="text-gray-600 dark:text-gray-400 font-semibold mb-1">AVG PERFECT</p>
          <p class="text-lg font-bold text-gray-900 dark:text-white">{{ averagePerfect }}</p>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <p class="text-gray-600 dark:text-gray-400 font-semibold mb-1">TOTAL POINTS</p>
          <p class="text-lg font-bold text-gray-900 dark:text-white">{{ settingsStore.totalPerfectRevisionsPoints }}</p>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <p class="text-gray-600 dark:text-gray-400 font-semibold mb-1">DAYS/TARGET</p>
          <p class="text-lg font-bold text-gray-900 dark:text-white">{{ settingsStore.finishRevisionDays }}</p>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded p-3">
          <p class="text-gray-600 dark:text-gray-400 font-semibold mb-1">PAGES/DAY</p>
          <p class="text-lg font-bold text-gray-900 dark:text-white">{{ settingsStore.pagesPerDay }}</p>
        </div>
      </div>

      <!-- Completion Estimate -->
      <div 
        v-if="estimatedCompletion"
        class="mt-4 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-800 rounded-lg"
      >
        <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">ESTIMATED COMPLETION</p>
        <p class="text-lg font-bold text-blue-600 dark:text-blue-400">
          {{ estimatedCompletion }}
        </p>
        <p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
          Based on {{ settingsStore.pagesPerDay }} page{{ settingsStore.pagesPerDay === 1 ? '' : 's' }} per day
        </p>
      </div>

      <!-- Status Message -->
      <div 
        v-if="statusMessage"
        :class="[
          'mt-4 p-4 rounded-lg border',
          statusMessage.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
            : statusMessage.type === 'warning'
            ? 'bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200'
            : 'bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
        ]"
      >
        <p class="text-sm font-semibold">{{ statusMessage.text }}</p>
      </div>
    </div>
  `,

  setup() {
    const memorizedPercentage = computed(() => {
      return Math.round((memorizedStore.memorizedCount / appStore.totalPages) * 100);
    });

    const pagesWithMistakes = computed(() => {
      return mistakesStore.pagesWithMistakesCount;
    });

    const mistakeRatio = computed(() => {
      if (pagesWithMistakes.value === 0) return 0;
      return Math.round((pagesWithMistakes.value / appStore.totalPages) * 100);
    });

    const perfectScore = computed(() => {
      return settingsStore.totalPerfectRevisionsPoints;
    });

    const currentJuz = computed(() => {
      return Math.ceil(appStore.currentPage / 20);
    });

    const memorizedJuzs = computed(() => {
      // Count how many complete juzs are memorized (all 20 pages)
      let count = 0;
      for (let i = 1; i <= 30; i++) {
        const startPage = (i - 1) * 20 + 1;
        const endPage = Math.min(i * 20, appStore.totalPages);
        
        let juzMemorized = true;
        for (let page = startPage; page <= endPage; page++) {
          if (!memorizedStore.isMemorized(page)) {
            juzMemorized = false;
            break;
          }
        }
        
        if (juzMemorized) count++;
      }
      return count;
    });

    const juzProgress = computed(() => {
      return (memorizedJuzs.value / 30) * 100;
    });

    const remainingPages = computed(() => {
      return appStore.totalPages - memorizedStore.memorizedCount;
    });

    const averagePerfect = computed(() => {
      if (settingsStore.perfectRevisionsCount === 0) return 0;
      return (
        settingsStore.totalPerfectRevisionsPoints /
        settingsStore.perfectRevisionsCount
      ).toFixed(1);
    });

    const estimatedCompletion = computed(() => {
      if (settingsStore.pagesPerDay === 0) return 'N/A';
      const daysNeeded = Math.ceil(
        remainingPages.value / settingsStore.pagesPerDay
      );
      const completionDate = new Date();
      completionDate.setDate(completionDate.getDate() + daysNeeded);
      return completionDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    });

    const statusMessage = computed(() => {
      if (memorizedPercentage.value === 100) {
        return {
          type: 'success',
          text: '🎉 Alhamdulillah! You have memorized the entire Quran!',
        };
      } else if (memorizedPercentage.value >= 75) {
        return {
          type: 'success',
          text: '✨ Excellent progress! You are 75% of the way there!',
        };
      } else if (mistakeRatio.value > 50) {
        return {
          type: 'warning',
          text: '⚠️ You have mistakes on more than 50% of pages. Focus on review!',
        };
      } else if (remainingPages.value <= 10) {
        return {
          type: 'success',
          text: '🎯 Almost there! Only ' + remainingPages.value + ' pages left!',
        };
      }
      return null;
    });

    return {
      memorizedStore,
      mistakesStore,
      settingsStore,
      appStore,
      memorizedPercentage,
      pagesWithMistakes,
      mistakeRatio,
      perfectScore,
      currentJuz,
      memorizedJuzs,
      juzProgress,
      remainingPages,
      averagePerfect,
      estimatedCompletion,
      statusMessage,
    };
  }
};
