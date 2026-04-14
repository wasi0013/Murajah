/**
 * PlanAudioCard Component
 * Shows playlists of today's plan pages for audio playback.
 * Uses page-by-page Quran audio from audioLoader.
 */

import { getPageAudioUrls, PAGE_RECITERS } from '../utils/audioLoader.js';

export default {
  name: 'PlanAudioCard',
  props: {
    todayTasks: { type: Object, default: null },
    t: { type: Function, required: true },
  },
  template: `
    <div class="bg-white rounded-xl border border-gray-200 overflow-hidden mt-3">
      <!-- Header -->
      <div class="px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="fas fa-headphones text-lg"></i>
            <h3 class="font-semibold text-sm">{{ t('plan.audio.title') }}</h3>
          </div>
          <div v-if="isPlaying" class="flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
            <span class="text-xs text-purple-100">{{ t('plan.audio.playing') }}</span>
          </div>
        </div>
      </div>

      <!-- No tasks -->
      <div v-if="playlists.length === 0" class="p-5 text-center">
        <i class="fas fa-music text-2xl text-gray-300 mb-2"></i>
        <p class="text-xs text-gray-500">{{ t('plan.audio.noTasks') }}</p>
      </div>

      <!-- Playlist selector -->
      <div v-else class="p-3">
        <div class="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
          <button v-for="pl in playlists" :key="pl.id"
            @click="selectPlaylist(pl.id)"
            :class="['flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              selectedPlaylistId === pl.id
                ? colorClasses(pl.color, true)
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300']">
            <i :class="pl.icon"></i>
            {{ pl.label }}
            <span class="text-[10px] opacity-70">({{ pl.pages.length }})</span>
          </button>
        </div>

        <!-- Player -->
        <div v-if="activePlaylist" class="space-y-3">
          <!-- Now playing info -->
          <div class="flex items-center justify-between px-1">
            <div class="text-xs text-gray-600">
              <span class="font-medium">{{ t('plan.today.openPage') }} {{ activePlaylist.pages[currentPageIndex] }}</span>
              <span class="text-gray-400 ml-1">· {{ currentPageIndex + 1 }}/{{ activePlaylist.pages.length }}</span>
            </div>
            <div v-if="audioPartsTotal > 1" class="text-[10px] text-gray-400">
              {{ t('plan.audio.part') }} {{ currentPartIndex + 1 }}/{{ audioPartsTotal }}
            </div>
          </div>

          <!-- Progress bar -->
          <div class="flex items-center gap-2">
            <span class="text-[10px] font-mono text-gray-500 w-8 text-right">{{ formatTime(currentTime) }}</span>
            <div class="flex-1 bg-gray-200 rounded-full h-1.5 cursor-pointer relative" @click="seekAudio">
              <div class="bg-purple-500 h-full rounded-full transition-all"
                :style="{ width: progressPercent + '%' }"></div>
            </div>
            <span class="text-[10px] font-mono text-gray-500 w-8">{{ formatTime(duration) }}</span>
          </div>

          <!-- Controls row -->
          <div class="flex items-center justify-between">
            <!-- Left: speed + loop -->
            <div class="flex items-center gap-1">
              <button @click="cycleSpeed"
                class="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 transition min-w-[40px]">
                {{ playbackSpeed }}x
              </button>
              <button @click="loopEnabled = !loopEnabled"
                :class="['p-1 rounded transition text-sm', loopEnabled ? 'text-purple-600 bg-purple-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100']"
                :title="loopEnabled ? t('plan.audio.loopOn') : t('plan.audio.loopOff')">
                <i class="fas fa-redo-alt"></i>
              </button>
            </div>

            <!-- Center: controls -->
            <div class="flex items-center gap-1">
              <button @click="prevPage" :disabled="currentPageIndex === 0"
                :class="['p-2 rounded-full transition', currentPageIndex === 0 ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100']">
                <i class="fas fa-step-backward text-sm"></i>
              </button>
              <button @click="togglePlayPause"
                class="p-2.5 rounded-full bg-purple-600 hover:bg-purple-700 transition text-white">
                <i :class="['fas text-sm', isPlaying ? 'fa-pause' : 'fa-play']"></i>
              </button>
              <button @click="nextPage" :disabled="currentPageIndex >= activePlaylist.pages.length - 1"
                :class="['p-2 rounded-full transition', currentPageIndex >= activePlaylist.pages.length - 1 ? 'text-gray-300' : 'text-gray-600 hover:bg-gray-100']">
                <i class="fas fa-step-forward text-sm"></i>
              </button>
            </div>

            <!-- Right: reciter -->
            <select v-model="selectedReciter" @change="onReciterChange"
              class="text-[10px] border border-gray-200 rounded px-1.5 py-1 text-gray-600 max-w-[90px] focus:outline-none focus:ring-1 focus:ring-purple-400">
              <option v-for="r in pageReciters" :key="r.id" :value="r.id">{{ reciterName(r.id) }}</option>
            </select>
          </div>

          <!-- Page list (collapsible) -->
          <div>
            <button @click="showPageList = !showPageList"
              class="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 w-full justify-center py-1">
              <i :class="['fas', showPageList ? 'fa-chevron-up' : 'fa-chevron-down']"></i>
              {{ showPageList ? t('plan.audio.hidePages') : t('plan.audio.showPages') }}
            </button>
            <div v-if="showPageList" class="max-h-32 overflow-y-auto space-y-0.5 mt-1">
              <button v-for="(page, idx) in activePlaylist.pages" :key="page"
                @click="playFromPage(idx)"
                :class="['w-full text-left px-3 py-1.5 rounded text-xs transition flex items-center justify-between',
                  currentPageIndex === idx && isPlaying
                    ? 'bg-purple-50 text-purple-700 font-medium'
                    : currentPageIndex === idx
                      ? 'bg-gray-50 text-gray-800 font-medium'
                      : 'text-gray-600 hover:bg-gray-50']">
                <span>{{ t('plan.today.openPage') }} {{ page }}</span>
                <i v-if="currentPageIndex === idx && isPlaying" class="fas fa-volume-up text-purple-500 text-[10px]"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  setup(props) {
    const { ref, computed, watch, onBeforeUnmount } = Vue;

    const selectedPlaylistId = ref(null);
    const selectedReciter = ref('alafasy');
    const playbackSpeed = ref(1);
    const isPlaying = ref(false);
    const currentPageIndex = ref(0);
    const currentPartIndex = ref(0);
    const currentTime = ref(0);
    const duration = ref(0);
    const showPageList = ref(false);
    const audioPartsTotal = ref(1);
    const loopEnabled = ref(false);

    let audio = null;
    let currentPageUrls = [];

    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const pageReciters = PAGE_RECITERS;

    const playlists = computed(() => {
      if (!props.todayTasks || props.todayTasks.metadata?.isOffDay) return [];
      const lists = [];
      if (props.todayTasks.revision?.pages?.length) {
        lists.push({
          id: 'revision',
          label: props.t('plan.today.revisionLabel'),
          icon: 'fas fa-book-open',
          pages: props.todayTasks.revision.pages,
          color: 'blue',
        });
      }
      if (props.todayTasks.weakReinforcement?.pages?.length) {
        lists.push({
          id: 'weak',
          label: props.t('plan.today.weakLabel'),
          icon: 'fas fa-exclamation-triangle',
          pages: props.todayTasks.weakReinforcement.pages,
          color: 'orange',
        });
      }
      if (props.todayTasks.newMemorization?.pages?.length) {
        lists.push({
          id: 'new',
          label: props.t('plan.today.newLabel'),
          icon: 'fas fa-seedling',
          pages: props.todayTasks.newMemorization.pages,
          color: 'green',
        });
      }
      return lists;
    });

    const activePlaylist = computed(() => {
      return playlists.value.find(pl => pl.id === selectedPlaylistId.value) || null;
    });

    const progressPercent = computed(() => {
      if (duration.value <= 0) return 0;
      return Math.min(100, (currentTime.value / duration.value) * 100);
    });

    function selectPlaylist(id) {
      if (selectedPlaylistId.value === id) return;
      stopAudio();
      selectedPlaylistId.value = id;
      currentPageIndex.value = 0;
      currentPartIndex.value = 0;
      loadPageAudio(0);
    }

    function loadPageAudio(pageIdx) {
      const pl = activePlaylist.value;
      if (!pl || pageIdx < 0 || pageIdx >= pl.pages.length) return;
      const pageNum = pl.pages[pageIdx];
      currentPageUrls = getPageAudioUrls(pageNum, selectedReciter.value);
      audioPartsTotal.value = currentPageUrls.length;
      currentPartIndex.value = 0;
    }

    function createAudio() {
      if (audio) {
        audio.pause();
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('error', onError);
        audio.src = '';
      }
      audio = new Audio();
      audio.playbackRate = playbackSpeed.value;
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('error', onError);
    }

    function onTimeUpdate() {
      if (audio) currentTime.value = audio.currentTime;
    }

    function onLoadedMetadata() {
      if (audio) duration.value = audio.duration;
    }

    function onError() {
      console.warn('[PlanAudio] Audio error, skipping to next');
      onEnded();
    }

    function onEnded() {
      // Try next part of the same page
      if (currentPartIndex.value < currentPageUrls.length - 1) {
        currentPartIndex.value++;
        playCurrentPart();
        return;
      }
      // Try next page in playlist
      const pl = activePlaylist.value;
      if (pl && currentPageIndex.value < pl.pages.length - 1) {
        currentPageIndex.value++;
        loadPageAudio(currentPageIndex.value);
        playCurrentPart();
        return;
      }
      // End of playlist — loop back if enabled
      if (loopEnabled.value) {
        currentPageIndex.value = 0;
        loadPageAudio(0);
        playCurrentPart();
        return;
      }
      isPlaying.value = false;
      currentTime.value = 0;
      duration.value = 0;
    }

    function playCurrentPart() {
      if (currentPageUrls.length === 0) return;
      createAudio();
      audio.src = currentPageUrls[currentPartIndex.value];
      audio.play().catch(() => {
        isPlaying.value = false;
      });
      isPlaying.value = true;
    }

    function togglePlayPause() {
      if (!activePlaylist.value) return;
      if (isPlaying.value) {
        if (audio) audio.pause();
        isPlaying.value = false;
      } else {
        if (audio && audio.src) {
          audio.play().catch(() => {});
          isPlaying.value = true;
        } else {
          loadPageAudio(currentPageIndex.value);
          playCurrentPart();
        }
      }
    }

    function nextPage() {
      const pl = activePlaylist.value;
      if (!pl || currentPageIndex.value >= pl.pages.length - 1) return;
      currentPageIndex.value++;
      loadPageAudio(currentPageIndex.value);
      if (isPlaying.value) {
        playCurrentPart();
      }
    }

    function prevPage() {
      if (currentPageIndex.value <= 0) return;
      currentPageIndex.value--;
      loadPageAudio(currentPageIndex.value);
      if (isPlaying.value) {
        playCurrentPart();
      }
    }

    function playFromPage(idx) {
      currentPageIndex.value = idx;
      loadPageAudio(idx);
      playCurrentPart();
    }

    function stopAudio() {
      if (audio) {
        audio.pause();
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('error', onError);
        audio.src = '';
        audio = null;
      }
      isPlaying.value = false;
      currentTime.value = 0;
      duration.value = 0;
    }

    function seekAudio(event) {
      if (!audio || !duration.value) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration.value;
    }

    function cycleSpeed() {
      const currentIdx = speeds.indexOf(playbackSpeed.value);
      playbackSpeed.value = speeds[(currentIdx + 1) % speeds.length];
      if (audio) audio.playbackRate = playbackSpeed.value;
    }

    function onReciterChange() {
      const wasPlaying = isPlaying.value;
      loadPageAudio(currentPageIndex.value);
      if (wasPlaying) {
        playCurrentPart();
      }
    }

    function reciterName(id) {
      // Try i18n key, fallback to formatted ID
      const key = `reciters.${id}`;
      const translated = props.t(key);
      if (translated && translated !== key) return translated;
      return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function colorClasses(color, active) {
      if (!active) return '';
      const map = {
        blue: 'bg-blue-50 text-blue-700 border-blue-300',
        orange: 'bg-orange-50 text-orange-700 border-orange-300',
        green: 'bg-green-50 text-green-700 border-green-300',
      };
      return map[color] || 'bg-purple-50 text-purple-700 border-purple-300';
    }

    function formatTime(seconds) {
      if (!seconds || !isFinite(seconds)) return '0:00';
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // Auto-select first playlist if only one
    watch(playlists, (newVal) => {
      if (newVal.length > 0 && !selectedPlaylistId.value) {
        selectedPlaylistId.value = newVal[0].id;
        loadPageAudio(0);
      }
    }, { immediate: true });

    // Cleanup on unmount
    onBeforeUnmount(() => {
      stopAudio();
    });

    return {
      playlists,
      activePlaylist,
      selectedPlaylistId,
      selectedReciter,
      playbackSpeed,
      isPlaying,
      currentPageIndex,
      currentPartIndex,
      currentTime,
      duration,
      progressPercent,
      audioPartsTotal,
      showPageList,
      loopEnabled,
      pageReciters,
      selectPlaylist,
      togglePlayPause,
      nextPage,
      prevPage,
      playFromPage,
      seekAudio,
      cycleSpeed,
      onReciterChange,
      reciterName,
      colorClasses,
      formatTime,
    };
  },
};
