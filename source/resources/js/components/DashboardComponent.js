/**
 * DashboardComponent
 * 
 * Main dashboard with:
 * - Overall progress bar
 * - Statistics cards
 * - Juz breakdown chart
 * - Quick actions
 */

import { computed } from 'vue';
import { memorizedStore } from '../stores/memorizedStore.js';
import { mistakesStore } from '../stores/mistakesStore.js';
import { settingsStore } from '../stores/settingsStore.js';
import { appStore } from '../stores/appStore.js';

export const DashboardComponent = {
  template: `
    <div class="dashboard-container">
      <!-- Main Progress Section -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Your Progress</h2>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {{ memorizedStore.memorizedCount }} of {{ appStore.totalPages }} pages memorized
            </p>
          </div>
          <div class="text-right">
            <p class="text-4xl font-bold text-blue-600 dark:text-blue-400">{{ overallProgress }}%</p>
            <p class="text-xs text-gray-600 dark:text-gray-400">Complete</p>
          </div>
        </div>

        <!-- Main Progress Bar -->
        <div class="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-4 overflow-hidden mb-4">
          <div
            class="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 h-full transition-all duration-500"
            :style="{ width: overallProgress + '%' }"
          ></div>
        </div>

        <!-- Progress Stats Row -->
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center">
            <p class="text-2xl font-bold text-green-600 dark:text-green-400">{{ memorizedStore.memorizedCount }}</p>
            <p class="text-xs text-gray-600 dark:text-gray-400">Memorized</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-orange-600 dark:text-orange-400">{{ remainingCount }}</p>
            <p class="text-xs text-gray-600 dark:text-gray-400">Remaining</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold text-red-600 dark:text-red-400">{{ mistakesStore.pagesWithMistakesCount }}</p>
            <p class="text-xs text-gray-600 dark:text-gray-400">With Mistakes</p>
          </div>
        </div>
      </div>

      <!-- Juz Overview Grid -->
      <div class="mb-6">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Juz Overview</h3>
        <div class="grid grid-cols-5 sm:grid-cols-10 gap-2">
          <div
            v-for="juz in 30"
            :key="juz"
            class="aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-200 cursor-pointer hover:scale-110"
            :class="getJuzClass(juz)"
            @click="goToJuz(juz)"
            :title="`Juz ${juz}: ${getJuzStatus(juz)}`"
          >
            {{ juz }}
          </div>
        </div>
        <p class="text-xs text-gray-600 dark:text-gray-400 mt-4">
          Click any Juz to jump to it • Green = fully memorized • Yellow = partially memorized • Gray = not started
        </p>
      </div>

      <!-- Detailed Stats -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <!-- Left Column -->
        <div class="space-y-4">
          <!-- Revision Stats -->
          <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-3">Perfect Revisions</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Pages with Perfect Score</span>
                <span class="font-semibold text-gray-900 dark:text-white">{{ settingsStore.perfectRevisionsCount }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Total Points</span>
                <span class="font-semibold text-gray-900 dark:text-white">{{ settingsStore.totalPerfectRevisionsPoints }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Average Score</span>
                <span class="font-semibold text-gray-900 dark:text-white">{{ averageScore }}</span>
              </div>
            </div>
          </div>

          <!-- Mistakes Overview -->
          <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-3">Mistakes Overview</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Total Mistakes</span>
                <span class="font-semibold text-gray-900 dark:text-white">{{ mistakesStore.totalMistakes }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Pages Affected</span>
                <span class="font-semibold text-gray-900 dark:text-white">{{ mistakesStore.pagesWithMistakesCount }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-gray-600 dark:text-gray-400">Average per Page</span>
                <span class="font-semibold text-gray-900 dark:text-white">{{ mistakesPerPage }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column -->
        <div class="space-y-4">
          <!-- Revision Settings -->
          <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-3">Revision Settings</h4>
            <div class="space-y-3">
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 font-semibold">Pages Per Day</label>
                <div class="flex items-center gap-2 mt-1">
                  <input
                    v-model.number="pagesPerDay"
                    type="number"
                    min="1"
                    @input="updatePagesPerDay"
                    class="flex-1 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <span class="text-xs text-gray-600 dark:text-gray-400">pages</span>
                </div>
              </div>
              <div>
                <label class="text-xs text-gray-600 dark:text-gray-400 font-semibold">Finish Within</label>
                <div class="flex items-center gap-2 mt-1">
                  <input
                    v-model.number="finishDays"
                    type="number"
                    min="1"
                    @input="updateFinishDays"
                    class="flex-1 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                  <span class="text-xs text-gray-600 dark:text-gray-400">days</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Completion Estimate -->
          <div class="bg-blue-50 dark:bg-blue-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <h4 class="text-sm font-bold text-blue-900 dark:text-blue-100 mb-2">Estimated Completion</h4>
            <p class="text-xl font-bold text-blue-600 dark:text-blue-400">{{ estimatedCompletionDate }}</p>
            <p class="text-xs text-blue-700 dark:text-blue-300 mt-1">
              {{ daysRemaining }} days at {{ settingsStore.pagesPerDay }} pages/day
            </p>
          </div>
        </div>
      </div>

      <!-- Top Pages by Mistakes -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <h4 class="text-sm font-bold text-gray-900 dark:text-white mb-4">Top Pages Needing Review</h4>
        <div class="space-y-2 max-h-48 overflow-y-auto">
          <div
            v-for="(pageData, index) in topMistakePages"
            :key="index"
            class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer transition-colors"
            @click="goToPage(pageData.page)"
          >
            <span class="text-sm font-semibold text-gray-900 dark:text-white">
              Page {{ pageData.page }}
            </span>
            <span class="px-2 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
              {{ pageData.mistakes }} mistakes
            </span>
          </div>
          <div v-if="topMistakePages.length === 0" class="text-center py-4">
            <p class="text-sm text-gray-600 dark:text-gray-400">No mistakes recorded! 🎉</p>
          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    let pagesPerDay = settingsStore.pagesPerDay;
    let finishDays = settingsStore.finishRevisionDays;

    const overallProgress = computed(() => {
      return Math.round((memorizedStore.memorizedCount / appStore.totalPages) * 100);
    });

    const remainingCount = computed(() => {
      return appStore.totalPages - memorizedStore.memorizedCount;
    });

    const averageScore = computed(() => {
      if (settingsStore.perfectRevisionsCount === 0) return 0;
      return (
        settingsStore.totalPerfectRevisionsPoints /
        settingsStore.perfectRevisionsCount
      ).toFixed(1);
    });

    const mistakesPerPage = computed(() => {
      if (mistakesStore.pagesWithMistakesCount === 0) return 0;
      return (
        mistakesStore.totalMistakes / mistakesStore.pagesWithMistakesCount
      ).toFixed(1);
    });

    const daysRemaining = computed(() => {
      if (settingsStore.pagesPerDay === 0) return 'N/A';
      return Math.ceil(remainingCount.value / settingsStore.pagesPerDay);
    });

    const estimatedCompletionDate = computed(() => {
      if (settingsStore.pagesPerDay === 0) return 'N/A';
      const days = daysRemaining.value;
      if (days === 'N/A') return 'N/A';
      
      const completion = new Date();
      completion.setDate(completion.getDate() + days);
      return completion.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    });

    const topMistakePages = computed(() => {
      const pagesWithMistakes = mistakesStore.getPagesWithMistakes();
      return pagesWithMistakes.slice(0, 5);
    });

    const getJuzClass = (juz) => {
      const startPage = (juz - 1) * 20 + 1;
      const endPage = Math.min(juz * 20, appStore.totalPages);

      let isFullyMemorized = true;
      let hasAnyMemorized = false;

      for (let page = startPage; page <= endPage; page++) {
        if (memorizedStore.isMemorized(page)) {
          hasAnyMemorized = true;
        } else {
          isFullyMemorized = false;
        }
      }

      if (isFullyMemorized) {
        return 'bg-green-500 dark:bg-green-600 text-white';
      } else if (hasAnyMemorized) {
        return 'bg-yellow-400 dark:bg-yellow-600 text-white';
      } else {
        return 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300';
      }
    };

    const getJuzStatus = (juz) => {
      const startPage = (juz - 1) * 20 + 1;
      const endPage = Math.min(juz * 20, appStore.totalPages);
      
      const memorizedPages = Array.from(
        { length: endPage - startPage + 1 },
        (_, i) => memorizedStore.isMemorized(startPage + i)
      ).filter(Boolean).length;

      const totalPages = endPage - startPage + 1;
      return `${memorizedPages}/${totalPages} pages memorized`;
    };

    const goToJuz = (juz) => {
      const startPage = (juz - 1) * 20 + 1;
      appStore.setCurrentPage(startPage);
    };

    const goToPage = (page) => {
      appStore.setCurrentPage(page);
    };

    const updatePagesPerDay = () => {
      if (pagesPerDay > 0) {
        settingsStore.setPagesPerDay(pagesPerDay);
      }
    };

    const updateFinishDays = () => {
      if (finishDays > 0) {
        settingsStore.setFinishRevisionDays(finishDays);
      }
    };

    return {
      memorizedStore,
      mistakesStore,
      settingsStore,
      appStore,
      overallProgress,
      remainingCount,
      averageScore,
      mistakesPerPage,
      daysRemaining,
      estimatedCompletionDate,
      topMistakePages,
      getJuzClass,
      getJuzStatus,
      goToJuz,
      goToPage,
      pagesPerDay,
      finishDays,
      updatePagesPerDay,
      updateFinishDays,
    };
  }
};
