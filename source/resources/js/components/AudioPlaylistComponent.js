/**
 * AudioPlaylistComponent
 * 
 * Audio recording and playback management:
 * - Record button with 3-second countdown
 * - Playback controls
 * - List of all recordings
 * - Delete functionality
 * - Duration display
 */

import { computed, ref } from 'vue';
import Logger from '../utils/logger.js';
import { audioStore } from '../stores/audioStore.js';
import { appStore } from '../stores/appStore.js';

export const AudioPlaylistComponent = {
  template: `
    <div class="audio-playlist-container">
      <!-- Countdown Overlay -->
      <div
        v-if="audioStore.showCountdown"
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      >
        <div class="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">Recording starts in</p>
          <p class="text-6xl font-bold text-blue-600 dark:text-blue-400">{{ audioStore.countdownValue }}</p>
        </div>
      </div>

      <!-- Header -->
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Audio Recordings</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          {{ audioStore.recordingsCount }} recordings ({{ totalDuration }} total)
        </p>
      </div>

      <!-- Recording Section -->
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
        <div class="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">Record Page {{ appStore.currentPage }}</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ recordedPagesCount }} of {{ appStore.totalPages }} pages recorded
            </p>
          </div>

          <div class="flex gap-3">
            <button
              v-if="!audioStore.isRecording"
              @click="startRecording"
              class="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-lg font-semibold transition-all duration-200 active:scale-95"
              title="Record audio for this page (3 second countdown)"
            >
              <span class="text-lg">🎤</span>
              <span>Record</span>
            </button>
            <button
              v-else
              @click="stopRecording"
              class="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700 text-white rounded-lg font-semibold transition-all duration-200 active:scale-95 animate-pulse"
              title="Stop recording"
            >
              <span class="text-lg">⏹</span>
              <span>Stop</span>
            </button>

            <button
              v-if="audioStore.recordingsCount > 0"
              @click="clearAllRecordings"
              class="px-6 py-3 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white rounded-lg font-semibold transition-all duration-200 active:scale-95"
              title="Delete all recordings"
            >
              Clear All
            </button>
          </div>
        </div>

        <!-- Recording Progress -->
        <div v-if="audioStore.isRecording" class="mt-4 flex items-center gap-3">
          <div class="flex-1 h-1 bg-red-300 dark:bg-red-800 rounded-full overflow-hidden">
            <div class="h-full bg-red-600 dark:bg-red-400 animate-pulse" style="width: 100%"></div>
          </div>
          <span class="text-sm font-semibold text-red-600 dark:text-red-400">Recording...</span>
        </div>
      </div>

      <!-- Statistics -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div class="bg-blue-50 dark:bg-blue-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">RECORDINGS</p>
          <p class="text-3xl font-bold text-blue-600 dark:text-blue-400">{{ audioStore.recordingsCount }}</p>
        </div>
        <div class="bg-green-50 dark:bg-green-900 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">PAGES</p>
          <p class="text-3xl font-bold text-green-600 dark:text-green-400">{{ recordedPagesCount }}</p>
        </div>
        <div class="bg-purple-50 dark:bg-purple-900 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">TOTAL TIME</p>
          <p class="text-3xl font-bold text-purple-600 dark:text-purple-400">{{ totalDuration }}</p>
        </div>
        <div class="bg-orange-50 dark:bg-orange-900 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
          <p class="text-xs text-gray-600 dark:text-gray-400 font-semibold">AVG LENGTH</p>
          <p class="text-3xl font-bold text-orange-600 dark:text-orange-400">{{ avgDuration }}</p>
        </div>
      </div>

      <!-- Recordings List -->
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="bg-gray-100 dark:bg-gray-700 px-6 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 class="font-bold text-gray-900 dark:text-white">All Recordings</h3>
        </div>

        <!-- Empty State -->
        <div v-if="audioStore.recordingsCount === 0" class="p-8 text-center">
          <p class="text-gray-600 dark:text-gray-400">No recordings yet. Start recording to save your progress!</p>
        </div>

        <!-- Recordings List -->
        <div v-else class="max-h-96 overflow-y-auto">
          <div
            v-for="(recording, index) in sortedRecordings"
            :key="recording.id"
            class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <div class="flex items-center justify-between gap-4">
              <!-- Recording Info -->
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-gray-900 dark:text-white truncate">
                  Page {{ recording.pageNumber }}
                  <span class="text-xs text-gray-600 dark:text-gray-400 font-normal">
                    {{ recording.name }}
                  </span>
                </p>
                <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {{ formatDate(recording.recordedAt) }} • {{ formatDuration(recording.duration) }}
                </p>
              </div>

              <!-- Playback Controls -->
              <div class="flex items-center gap-2">
                <button
                  @click="playAudio(recording.id)"
                  :class="[
                    'px-4 py-2 rounded-lg font-semibold transition-all duration-200 text-sm',
                    audioStore.currentPlayingId === recording.id
                      ? 'bg-blue-500 dark:bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500'
                  ]"
                  title="Play recording"
                >
                  {{ audioStore.currentPlayingId === recording.id ? '⏸' : '▶' }}
                </button>

                <!-- Delete Button -->
                <button
                  @click="deleteRecording(recording.id)"
                  class="px-3 py-2 rounded-lg text-white bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 font-semibold transition-all duration-200 active:scale-95 text-sm"
                  title="Delete recording"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Audio Element -->
            <audio
              v-if="audioStore.currentPlayingId === recording.id"
              :key="recording.id"
              :src="getAudioUrl(recording.audioBlob)"
              autoplay
              @ended="audioStore.currentPlayingId = null"
              class="w-full mt-2 h-8"
              controls
            ></audio>
          </div>
        </div>
      </div>

      <!-- Export Section -->
      <div v-if="audioStore.recordingsCount > 0" class="mt-6 bg-blue-50 dark:bg-blue-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
        <h4 class="font-bold text-blue-900 dark:text-blue-100 mb-2">Export Recordings</h4>
        <p class="text-sm text-blue-700 dark:text-blue-300 mb-3">
          Download all your recordings as a ZIP file to backup or share them.
        </p>
        <button
          @click="exportRecordings"
          class="px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 active:scale-95"
        >
          📥 Export All
        </button>
      </div>
    </div>
  `,

  setup() {
    const recordedPagesCount = computed(() => {
      const pages = new Set(audioStore.recordedPages);
      return pages.size;
    });

    const totalDuration = computed(() => {
      const total = audioStore.sortedRecordings.reduce(
        (sum, r) => sum + (r.duration || 0),
        0
      );
      return formatDurationInMinutes(total);
    });

    const avgDuration = computed(() => {
      if (audioStore.recordingsCount === 0) return '0s';
      const total = audioStore.sortedRecordings.reduce(
        (sum, r) => sum + (r.duration || 0),
        0
      );
      const avg = Math.round(total / audioStore.recordingsCount);
      return formatDurationInSeconds(avg);
    });

    const sortedRecordings = computed(() => {
      return [...audioStore.sortedRecordings].reverse(); // Most recent first
    });

    const startRecording = async () => {
      try {
        await audioStore.startCountdown();
      } catch (error) {
        Logger.error(Logger.MODULES.AUDIO, 'Failed to start recording', error);
        alert('Error starting recording: ' + error.message);
      }
    };

    const stopRecording = async () => {
      try {
        await audioStore.stopRecording(appStore.currentPage);
      } catch (error) {
        Logger.error(Logger.MODULES.AUDIO, 'Failed to stop recording', error);
        alert('Error stopping recording: ' + error.message);
      }
    };

    const playAudio = (recordingId) => {
      try {
        audioStore.playAudio(recordingId);
      } catch (error) {
        Logger.error(Logger.MODULES.AUDIO, 'Playback failed', error);
        alert('Error playing audio: ' + error.message);
      }
    };

    const deleteRecording = async (recordingId) => {
      if (confirm('Delete this recording?')) {
        try {
          await audioStore.deleteAudio(recordingId);
        } catch (error) {
          Logger.error(Logger.MODULES.AUDIO, 'Failed to delete recording', error);
          alert('Error deleting recording: ' + error.message);
        }
      }
    };

    const clearAllRecordings = async () => {
      if (confirm('Delete ALL recordings? This cannot be undone.')) {
        try {
          await audioStore.clearAllRecordings();
        } catch (error) {
          Logger.error(Logger.MODULES.AUDIO, 'Failed to clear all recordings', error);
          alert('Error clearing recordings: ' + error.message);
        }
      }
    };

    const exportRecordings = () => {
      alert('Export functionality will be implemented in a future update.');
      // TODO: Implement ZIP export
    };

    const getAudioUrl = (audioBlob) => {
      if (!audioBlob) return '';
      return URL.createObjectURL(audioBlob);
    };

    const formatDate = (date) => {
      if (!date) return 'Unknown';
      try {
        return new Date(date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return 'Invalid date';
      }
    };

    const formatDuration = (seconds) => {
      if (!seconds) return '0s';
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      if (mins > 0) {
        return `${mins}m ${secs}s`;
      }
      return `${secs}s`;
    };

    const formatDurationInMinutes = (seconds) => {
      if (!seconds) return '0m';
      const mins = Math.floor(seconds / 60);
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      if (hours > 0) {
        return `${hours}h ${remainMins}m`;
      }
      return `${mins}m`;
    };

    const formatDurationInSeconds = (seconds) => {
      if (!seconds) return '0s';
      if (seconds >= 60) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
      }
      return `${seconds}s`;
    };

    return {
      audioStore,
      appStore,
      recordedPagesCount,
      totalDuration,
      avgDuration,
      sortedRecordings,
      startRecording,
      stopRecording,
      playAudio,
      deleteRecording,
      clearAllRecordings,
      exportRecordings,
      getAudioUrl,
      formatDate,
      formatDuration,
    };
  }
};
