/**
 * SettingsComponent
 * 
 * Application settings and preferences:
 * - Theme toggle (light/dark)
 * - Font size selector
 * - Tajweed toggle
 * - Export/Import functionality
 * - Data management
 */

import { ref } from 'vue';
import Logger from '../utils/logger.js';
import { appStore } from '../stores/appStore.js';
import { settingsStore } from '../stores/settingsStore.js';
import { memorizedStore } from '../stores/memorizedStore.js';
import { mistakesStore } from '../stores/mistakesStore.js';
import { audioStore } from '../stores/audioStore.js';

export const SettingsComponent = {
  template: `
    <div class="settings-container space-y-6">
      <!-- Header -->
      <div class="mb-8">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Customize your Murajah experience
        </p>
      </div>

      <!-- Display Settings -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Display Settings</h3>

        <!-- Theme Toggle -->
        <div class="mb-6">
          <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">Theme</label>
          <div class="flex gap-3 mt-2">
            <button
              @click="appStore.setTheme('light')"
              :class="[
                'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200',
                appStore.theme === 'light'
                  ? 'bg-yellow-500 dark:bg-yellow-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              ]"
            >
              <span class="text-lg">☀️</span>
              Light
            </button>
            <button
              @click="appStore.setTheme('dark')"
              :class="[
                'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200',
                appStore.theme === 'dark'
                  ? 'bg-indigo-500 dark:bg-indigo-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              ]"
            >
              <span class="text-lg">🌙</span>
              Dark
            </button>
          </div>
        </div>

        <!-- Font Size -->
        <div class="mb-6">
          <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">Font Size</label>
          <div class="flex gap-3 mt-2">
            <button
              v-for="size in ['small', 'medium', 'large']"
              :key="size"
              @click="settingsStore.setFontSize(size)"
              :class="[
                'px-4 py-2 rounded-lg font-semibold transition-all duration-200 capitalize',
                settingsStore.fontSize === size
                  ? 'bg-blue-500 dark:bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              ]"
            >
              <span :class="getFontSizeClass(size)">{{ size }}</span>
            </button>
          </div>
        </div>

        <!-- Tajweed Toggle -->
        <div>
          <label class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
            <span>Tajweed Rules</span>
            <span class="text-xs text-gray-600 dark:text-gray-400">(Arabic diacritic marks)</span>
          </label>
          <div class="flex gap-3 mt-2">
            <button
              @click="settingsStore.toggleTajweed()"
              :class="[
                'flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200',
                settingsStore.tajweedEnabled
                  ? 'bg-green-500 dark:bg-green-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
              ]"
            >
              <span>{{ settingsStore.tajweedEnabled ? '✓' : '○' }}</span>
              {{ settingsStore.tajweedEnabled ? 'Enabled' : 'Disabled' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Revision Goals -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Revision Goals</h3>

        <!-- Pages Per Day -->
        <div class="mb-6">
          <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">Pages Per Day</label>
          <div class="flex items-center gap-3 mt-2">
            <input
              v-model.number="localPagesPerDay"
              type="number"
              min="1"
              max="100"
              class="w-20 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-600 dark:text-gray-400">pages per day</span>
            <button
              @click="savePagesPerDay"
              class="px-4 py-2 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg font-semibold transition-all duration-200"
            >
              Save
            </button>
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Helps calculate estimated completion date
          </p>
        </div>

        <!-- Finish Within Days -->
        <div>
          <label class="text-sm font-semibold text-gray-700 dark:text-gray-300">Finish Within</label>
          <div class="flex items-center gap-3 mt-2">
            <input
              v-model.number="localFinishDays"
              type="number"
              min="1"
              max="365"
              class="w-20 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span class="text-sm text-gray-600 dark:text-gray-400">days</span>
            <button
              @click="saveFinishDays"
              class="px-4 py-2 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg font-semibold transition-all duration-200"
            >
              Save
            </button>
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-2">
            Target date for memorizing the entire Quran
          </p>
        </div>
      </div>

      <!-- Data Management -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Data Management</h3>

        <!-- Export Data -->
        <div class="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
          <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Export Data</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Download your memorization data as a JSON file for backup or sharing.
          </p>
          <button
            @click="exportData"
            class="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200"
          >
            <span class="text-lg">📥</span>
            Export Data
          </button>
        </div>

        <!-- Import Data -->
        <div class="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
          <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Import Data</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Import previously exported data to restore your progress.
          </p>
          <input
            type="file"
            accept=".json"
            @change="handleImport"
            ref="importFileInput"
            class="hidden"
          />
          <button
            @click="triggerImport"
            class="flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg font-semibold transition-all duration-200"
          >
            <span class="text-lg">📤</span>
            Import Data
          </button>
        </div>

        <!-- Reset All Data -->
        <div>
          <h4 class="font-semibold text-gray-900 dark:text-white mb-3">Dangerous Zone</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Reset all your data. This action cannot be undone.
          </p>
          <button
            @click="resetAllData"
            class="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-lg font-semibold transition-all duration-200"
          >
            <span class="text-lg">🗑️</span>
            Reset All Data
          </button>
        </div>
      </div>

      <!-- About -->
      <div class="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 rounded-lg p-6 border border-blue-200 dark:border-blue-700">
        <h3 class="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2">About Murajah</h3>
        <p class="text-sm text-blue-800 dark:text-blue-200 mb-2">
          Version {{ appStore.appVersion }}
        </p>
        <p class="text-sm text-blue-800 dark:text-blue-200">
          Murajah is a Quran memorization helper tool built with Vue 3, Tailwind CSS, and IndexedDB.
        </p>
      </div>
    </div>
  `,

  setup() {
    const importFileInput = ref(null);
    const localPagesPerDay = ref(settingsStore.pagesPerDay);
    const localFinishDays = ref(settingsStore.finishRevisionDays);

    const getFontSizeClass = (size) => {
      switch (size) {
        case 'small':
          return 'text-sm';
        case 'medium':
          return 'text-base';
        case 'large':
          return 'text-lg';
        default:
          return 'text-base';
      }
    };

    const savePagesPerDay = () => {
      if (localPagesPerDay.value > 0) {
        settingsStore.setPagesPerDay(localPagesPerDay.value);
        alert('Pages per day updated!');
      }
    };

    const saveFinishDays = () => {
      if (localFinishDays.value > 0) {
        settingsStore.setFinishRevisionDays(localFinishDays.value);
        alert('Target finish date updated!');
      }
    };

    const exportData = () => {
      const data = {
        version: appStore.appVersion,
        exportDate: new Date().toISOString(),
        memorized: Array.from(memorizedStore.memorizedArray),
        mistakes: Object.fromEntries(
          Array.from(mistakesStore.mistakes).map(([page, words]) => [
            page,
            Array.from(words),
          ])
        ),
        recordings: audioStore.sortedRecordings.length,
        settings: {
          pagesPerDay: settingsStore.pagesPerDay,
          finishRevisionDays: settingsStore.finishRevisionDays,
          tajweedEnabled: settingsStore.tajweedEnabled,
          fontSize: settingsStore.fontSize,
          theme: appStore.theme,
        },
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `murajah-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };

    const triggerImport = () => {
      importFileInput.value.click();
    };

    const handleImport = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Restore memorized pages
        if (data.memorized && Array.isArray(data.memorized)) {
          await memorizedStore.bulkMarkMemorized(data.memorized);
        }

        // Restore settings
        if (data.settings) {
          if (data.settings.pagesPerDay)
            settingsStore.setPagesPerDay(data.settings.pagesPerDay);
          if (data.settings.finishRevisionDays)
            settingsStore.setFinishRevisionDays(data.settings.finishRevisionDays);
          if (data.settings.fontSize)
            settingsStore.setFontSize(data.settings.fontSize);
          if (data.settings.theme) appStore.setTheme(data.settings.theme);
        }

        Logger.info(Logger.MODULES.CORE, 'Data imported successfully');
        alert('Data imported successfully! Please refresh the page.');
      } catch (error) {
        Logger.error(Logger.MODULES.CORE, 'Import failed', error);
        alert('Error importing data: ' + error.message);
      }

      event.target.value = '';
    };

    const resetAllData = () => {
      if (
        confirm(
          'Are you absolutely sure? This will delete ALL your data including memorized pages, mistakes, and recordings. This cannot be undone.'
        )
      ) {
        try {
          memorizedStore.clearAllMemorized();
          mistakesStore.clearAllMistakes();
          audioStore.clearAllRecordings();
          Logger.info(Logger.MODULES.CORE, 'All data reset by user');
          alert('All data has been reset.');
          window.location.reload();
        } catch (error) {
          Logger.error(Logger.MODULES.CORE, 'Reset failed', error);
          alert('Error resetting data: ' + error.message);
        }
      }
    };

    return {
      appStore,
      settingsStore,
      importFileInput,
      localPagesPerDay,
      localFinishDays,
      getFontSizeClass,
      savePagesPerDay,
      saveFinishDays,
      exportData,
      triggerImport,
      handleImport,
      resetAllData,
    };
  }
};
