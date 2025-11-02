/**
 * Quran Audio Player Component
 * Plays all verses of the current page sequentially
 */

export const QuranAudioPlayerComponent = {
  template: `
    <div class="bg-white rounded-lg shadow-md p-6 mt-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <i class="fas fa-music text-blue-600 text-xl"></i>
          <h3 class="text-lg font-semibold text-gray-900">Listen audio
            <span v-if="pageVerses.length > 0" class="text-sm font-normal text-gray-500">
              ({{ pageVerses.length }} verse{{ pageVerses.length !== 1 ? 's' : '' }})
            </span>
          </h3>
        </div>
        <button 
          @click="togglePlaylist" 
          class="text-gray-500 hover:text-gray-700 transition"
          :title="showPlaylist ? 'Hide playlist' : 'Show playlist'"
        >
          <i :class="['fas', showPlaylist ? 'fa-chevron-up' : 'fa-chevron-down']"></i>
        </button>
      </div>

      <!-- No verses message -->
      <div v-if="pageVerses.length === 0" class="text-center py-4 text-gray-500">
        <i class="fas fa-info-circle mr-2"></i>
        No verses available for this page
      </div>

      <!-- Player Controls -->
      <div v-else class="space-y-4">
        <!-- Progress bar -->
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-gray-600 w-10">{{ currentVerseName }}</span>
          <div class="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden cursor-pointer" @click="seekAudio">
            <div 
              class="bg-blue-600 h-full transition-all"
              :style="{ width: progressPercentage + '%' }"
            ></div>
          </div>
          <span class="text-xs font-medium text-gray-600 w-10 text-right">{{ pageVerses.length }}</span>
        </div>

        <!-- Playback time -->
        <div class="flex justify-between text-xs text-gray-500">
          <span>{{ formatTime(currentTime) }}</span>
          <span>{{ formatTime(duration) }}</span>
        </div>

        <!-- Control buttons -->
        <div class="flex items-center justify-center gap-3">
          <button 
            @click="previousVerse" 
            class="p-2 rounded-full hover:bg-gray-100 transition"
            :disabled="currentVerseIndex === 0"
            :class="{ 'opacity-50 cursor-not-allowed': currentVerseIndex === 0 }"
          >
            <i class="fas fa-step-backward text-gray-600"></i>
          </button>

          <button 
            @click="togglePlayPause" 
            class="p-3 rounded-full bg-blue-600 hover:bg-blue-700 transition text-white"
          >
            <i :class="['fas', isPlaying ? 'fa-pause' : 'fa-play']"></i>
          </button>

          <button 
            @click="nextVerse" 
            class="p-2 rounded-full hover:bg-gray-100 transition"
            :disabled="currentVerseIndex >= pageVerses.length - 1"
            :class="{ 'opacity-50 cursor-not-allowed': currentVerseIndex >= pageVerses.length - 1 }"
          >
            <i class="fas fa-step-forward text-gray-600"></i>
          </button>

          <button 
            @click="toggleAutoPlay" 
            class="p-2 rounded-full transition"
            :class="[
              autoPlayNext 
                ? 'bg-blue-100 text-blue-600' 
                : 'hover:bg-gray-100 text-gray-600'
            ]"
            title="Auto-play next verse"
          >
            <i class="fas fa-sync-alt"></i>
          </button>

          <button 
            @click="stopAudio" 
            class="p-2 rounded-full hover:bg-gray-100 transition text-gray-600"
          >
            <i class="fas fa-stop"></i>
          </button>
        </div>

        <!-- Playlist -->
        <div v-if="showPlaylist" class="mt-4 border-t pt-4">
          <div class="max-h-48 overflow-y-auto space-y-1">
            <button
              v-for="(v, idx) in pageVerses"
              :key="'verse_' + v.chapter + '_' + v.verse"
              @click="playVerse(idx)"
              class="w-full text-left px-3 py-2 rounded transition text-sm"
              :class="[
                currentVerseIndex === idx
                  ? 'bg-blue-100 text-blue-700 font-semibold'
                  : 'hover:bg-gray-100 text-gray-700'
              ]"
            >
              <span class="font-medium">{{ v.chapter }}:{{ v.verse }}</span>
              <span class="text-gray-500 ml-2">{{ v.text.substring(0, 40) }}...</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Hidden audio element -->
      <audio 
        ref="audioElement"
        @timeupdate="updateProgress"
        @loadedmetadata="onAudioLoaded"
        @ended="onAudioEnded"
        @error="onAudioError"
      ></audio>
    </div>
  `,

  props: {
    currentPage: {
      type: Number,
      required: true
    },
    quranData: {
      type: Array,
      required: true
    }
  },

  data() {
    return {
      pageVerses: [],
      currentVerseIndex: 0,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      autoPlayNext: true,
      showPlaylist: false,
      audioElement: null
    };
  },

  computed: {
    currentVerseName() {
      if (this.pageVerses.length === 0) return '-';
      const verse = this.pageVerses[this.currentVerseIndex];
      return `${verse.chapter}:${verse.verse}`;
    },

    progressPercentage() {
      if (this.duration === 0) return 0;
      return (this.currentTime / this.duration) * 100;
    }
  },

  methods: {
    /**
     * Load verses for the current page
     */
    loadPageVerses() {
      console.log('[Murajah-Audio] loadPageVerses called', {
        currentPage: this.currentPage,
        quranDataReceived: !!this.quranData,
        quranDataType: typeof this.quranData,
        quranDataIsArray: Array.isArray(this.quranData),
        quranDataIsObject: this.quranData && typeof this.quranData === 'object'
      });

      if (!this.quranData) {
        console.warn(`[Murajah-Audio] Missing quran data for page ${this.currentPage}`);
        this.pageVerses = [];
        return;
      }

      // quran.json is structured as an object with surah numbers as keys
      // e.g., { "1": [{chapter, verse, page, text}, ...], "2": [...], ... }
      let allVerses = [];
      
      if (Array.isArray(this.quranData)) {
        console.log('[Murajah-Audio] Data is an array');
        allVerses = this.quranData;
      } else if (typeof this.quranData === 'object') {
        console.log('[Murajah-Audio] Data is an object, flattening...');
        const surahKeys = Object.keys(this.quranData);
        console.log('[Murajah-Audio] Found surahs:', surahKeys.length);
        
        Object.values(this.quranData).forEach((surahVerses, idx) => {
          if (Array.isArray(surahVerses)) {
            allVerses.push(...surahVerses);
            if (idx === 0) {
              console.log('[Murajah-Audio] First surah has', surahVerses.length, 'verses');
              if (surahVerses[0]) {
                console.log('[Murajah-Audio] First verse structure:', surahVerses[0]);
              }
            }
          }
        });
      }

      console.log('[Murajah-Audio] Total verses after flattening:', allVerses.length);

      if (allVerses.length === 0) {
        console.warn(`[Murajah-Audio] No verses found in quran data`);
        this.pageVerses = [];
        return;
      }

      // Filter all verses on this page and sort by surah and ayah
      const versesBeforeFilter = allVerses.length;
      this.pageVerses = allVerses
        .filter(verse => verse && verse.page === this.currentPage)
        .sort((a, b) => {
          if (a.chapter !== b.chapter) {
            return a.chapter - b.chapter;
          }
          return a.verse - b.verse;
        });

      console.log(`[Murajah-Audio] Loaded ${this.pageVerses.length} verses for page ${this.currentPage} (filtered from ${versesBeforeFilter} total)`);

      // Reset to first verse
      this.currentVerseIndex = 0;
      this.currentTime = 0;
      this.duration = 0;
      this.isPlaying = false;
    },

    /**
     * Get audio URL for a verse with fallback
     */
    getAudioUrl(verse) {
      const surah = verse.chapter;
      const ayah = verse.verse;
      const surahPadded = String(surah).padStart(3, '0');
      const ayahPadded = String(ayah).padStart(3, '0');

      // Primary URL
      const primaryUrl = `https://the-quran-project.github.io/Quran-Audio/Data/1/${surah}_${ayah}.mp3`;
      // Fallback URL
      const fallbackUrl = `https://everyayah.com/data/Alafasy_128kbps/${surahPadded}${ayahPadded}.mp3`;

      return { primaryUrl, fallbackUrl };
    },

    /**
     * Play a specific verse by index
     */
    playVerse(index) {
      if (index < 0 || index >= this.pageVerses.length) return;

      this.currentVerseIndex = index;
      const verse = this.pageVerses[index];
      const { primaryUrl, fallbackUrl } = this.getAudioUrl(verse);

      // Try primary URL first, fallback to fallback URL
      this.audioElement.src = primaryUrl;
      this.audioElement.onloadstart = () => {
        // If primary fails, try fallback
        this.audioElement.addEventListener('error', () => {
          this.audioElement.src = fallbackUrl;
        }, { once: true });
      };

      this.audioElement.play().catch(error => {
        console.error('[Murajah] Audio playback error:', error);
      });

      this.isPlaying = true;
    },

    /**
     * Toggle play/pause
     */
    togglePlayPause() {
      if (this.pageVerses.length === 0) return;

      if (this.isPlaying) {
        this.audioElement.pause();
        this.isPlaying = false;
      } else {
        if (this.audioElement.src === '') {
          this.playVerse(this.currentVerseIndex);
        } else {
          this.audioElement.play().catch(error => {
            console.error('[Murajah] Audio playback error:', error);
          });
        }
        this.isPlaying = true;
      }
    },

    /**
     * Play next verse
     */
    nextVerse() {
      if (this.currentVerseIndex < this.pageVerses.length - 1) {
        this.playVerse(this.currentVerseIndex + 1);
      }
    },

    /**
     * Play previous verse
     */
    previousVerse() {
      if (this.currentVerseIndex > 0) {
        this.playVerse(this.currentVerseIndex - 1);
      }
    },

    /**
     * Stop audio playback
     */
    stopAudio() {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.isPlaying = false;
      this.currentTime = 0;
    },

    /**
     * Toggle auto-play next verse
     */
    toggleAutoPlay() {
      this.autoPlayNext = !this.autoPlayNext;
    },

    /**
     * Update progress bar
     */
    updateProgress() {
      this.currentTime = this.audioElement.currentTime;
    },

    /**
     * Seek to position in audio
     */
    seekAudio(event) {
      const rect = event.currentTarget.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const percentage = clickX / rect.width;
      this.audioElement.currentTime = percentage * this.duration;
    },

    /**
     * Handle audio metadata loaded
     */
    onAudioLoaded() {
      this.duration = this.audioElement.duration;
    },

    /**
     * Handle audio end
     */
    onAudioEnded() {
      if (this.autoPlayNext && this.currentVerseIndex < this.pageVerses.length - 1) {
        this.nextVerse();
      } else {
        this.isPlaying = false;
      }
    },

    /**
     * Handle audio error
     */
    onAudioError(error) {
      console.error('[Murajah] Audio loading error:', error);
      // Try fallback
      const verse = this.pageVerses[this.currentVerseIndex];
      if (verse) {
        const { fallbackUrl } = this.getAudioUrl(verse);
        this.audioElement.src = fallbackUrl;
        this.audioElement.play().catch(err => {
          console.error('[Murajah] Fallback audio also failed:', err);
        });
      }
    },

    /**
     * Format time in seconds to MM:SS
     */
    formatTime(seconds) {
      if (!seconds || isNaN(seconds)) return '0:00';
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * Toggle playlist visibility
     */
    togglePlaylist() {
      this.showPlaylist = !this.showPlaylist;
    }
  },

  watch: {
    currentPage() {
      this.loadPageVerses();
    },
    quranData() {
      this.loadPageVerses();
    }
  },

  mounted() {
    this.audioElement = this.$refs.audioElement;
    this.loadPageVerses();
    console.log('[Murajah] Audio player component mounted', {
      currentPage: this.currentPage,
      quranDataType: typeof this.quranData,
      quranDataIsArray: Array.isArray(this.quranData),
      quranDataKeys: this.quranData && typeof this.quranData === 'object' ? Object.keys(this.quranData).length : 'N/A',
      pageVerses: this.pageVerses.length
    });
  }
};
