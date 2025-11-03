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
          <h3 class="text-lg font-semibold text-gray-900">Audio of Page {{ currentPage }}
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

        <!-- Control buttons row with reciter selector and spaced repetition -->
        <div class="flex items-center justify-between gap-4">
          <!-- Left side: Playback controls -->
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
              <i class="fas fa-long-arrow-alt-right"></i>
            </button>

            <button 
              @click="toggleRepeatPlaylist" 
              class="p-2 rounded-full transition"
              :class="[
                repeatPlaylist 
                  ? 'bg-blue-100 text-blue-600' 
                  : 'hover:bg-gray-100 text-gray-600'
              ]"
              title="Repeat entire playlist"
            >
              <i class="fas fa-retweet"></i>
            </button>

            <button 
              @click="stopAudio" 
              class="p-2 rounded-full hover:bg-gray-100 transition text-gray-600"
            >
              <i class="fas fa-stop"></i>
            </button>
          </div>

          <!-- Right side: Reciter selector and Spaced Repetition button -->
          <div class="flex items-center gap-3 flex-shrink-0">
            <!-- Reciter selector -->
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium text-gray-700 whitespace-nowrap">Reciter:</label>
              <select 
                v-model="selectedReciter" 
                class="px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option v-for="reciter in availableReciters" :key="reciter.id" :value="reciter.id">
                  {{ reciter.name }}
                </option>
              </select>
            </div>

            <!-- Spaced Repetition Toggle Button -->
            <button 
              @click="useSpacedRepetition = !useSpacedRepetition"
              class="p-2 rounded-full transition flex-shrink-0"
              :class="[
                useSpacedRepetition 
                  ? 'bg-purple-100 text-purple-600' 
                  : 'hover:bg-gray-100 text-gray-600'
              ]"
              title="Toggle Spaced Repetition"
            >
              <i class="fas fa-sync-alt"></i> Repeat
            </button>
          </div>
        </div>

        <!-- Spaced Repetition Controls (Details) -->
        <div v-if="useSpacedRepetition" class="border-t pt-4 space-y-3">
          <!-- Repeat count input -->
          <div class="flex items-center gap-3 bg-purple-50 p-3 rounded-lg">
            <label class="text-sm font-medium text-gray-700 whitespace-nowrap">Repeat each verses:</label>
            <input 
              v-model.number="repeatCount" 
              type="number" 
              min="1" 
              max="10"
              @change="generateSpacedPlaylist"
              class="w-16 px-2 py-1 border border-purple-300 rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
            <span class="text-sm text-gray-600">times</span>
            <span v-if="spacedPlaylist.length > 0" class="text-xs text-purple-600 font-semibold ml-auto">
              {{ totalSpacedRepetitionPlays }} plays total
            </span>
          </div>

          <!-- Spaced repetition info -->
          <div v-if="spacedPlaylist.length > 0" class="text-xs text-purple-700 bg-purple-50 p-2 rounded">
            <i class="fas fa-lightbulb mr-1"></i>
            Cumulative learning: Each verse builds on previous ones
          </div>
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
      repeatPlaylist: false,
      showPlaylist: false,
      audioElement: null,
      // Reciter selection
      selectedReciter: 'shuraim', // Default reciter
      availableReciters: [
        { id: 'shuraim', name: 'Sheikh Shuraim' },
        { id: 'ali_jaber', name: 'Ali Jaber' },
        { id: 'minshawy', name: 'Muhammad Siddiq Al-Minshawy' },
        { id: 'ayyoub', name: 'Muhammad Ayyoub' },
        { id: 'abdul_basit', name: 'Abdul Basit Abd El-Samad' },
        { id: 'alafasy', name: 'Mishary Rashid Al Afasy' },
        { id: 'abu_bakr', name: 'Abu Bakr Al Shatri' },
        { id: 'nasser', name: 'Nasser Al Qatami' },
        { id: 'yasser', name: 'Yasser Al Dosari' },
        { id: 'hani', name: 'Hani Ar Rifai' }
      ],
      // Spaced repetition feature
      useSpacedRepetition: false,
      repeatCount: 3,
      spacedPlaylist: [], // Generated playlist with repetitions
      currentPlaylistIndex: 0, // Track position in spaced playlist
      currentSequenceIndices: [], // Verses in current sequence
      currentSequencePosition: 0, // Which verse in sequence
      currentSequenceRepeatCount: 1, // How many times to repeat the sequence
      currentSequenceRepeatPosition: 0 // Which repeat we're on
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
    },

    totalSpacedRepetitionPlays() {
      // Calculate total number of audio files that will play
      // Each item in spacedPlaylist has:
      // - verseIndices: array of verse indices
      // - repeatCount: how many times to repeat the sequence
      // Total plays = sum of (verseIndices.length * repeatCount) for each item
      
      if (this.spacedPlaylist.length === 0) return 0;
      
      let totalPlays = 0;
      for (let item of this.spacedPlaylist) {
        // Each verse in the sequence plays once per repeat
        totalPlays += item.verseIndices.length * item.repeatCount;
      }
      return totalPlays;
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
      this.currentSequenceIndices = []; // Track current sequence being played
      this.currentSequencePosition = 0; // Track position within sequence

      // Generate spaced repetition playlist if enabled
      if (this.useSpacedRepetition) {
        this.generateSpacedPlaylist();
      }
    },

    /**
     * Generate spaced repetition playlist
     * Sequence: V1 x N, V2 x N, (V1+V2) x N, V3 x N, (V1+V2+V3) x N, V4 x N, (V1+V2+V3+V4) x N, etc.
     * 
     * Each playlist item contains:
     * - verseIndices: array of verse indices to play in sequence
     * - repeatCount: how many times to repeat this entire sequence
     * - label: display name
     */
    generateSpacedPlaylist() {
      if (this.pageVerses.length === 0) {
        this.spacedPlaylist = [];
        return;
      }

      this.spacedPlaylist = [];
      const repeatCount = this.repeatCount || 1;

      // Build the spaced repetition sequence
      for (let i = 0; i < this.pageVerses.length; i++) {
        // Add individual verse with N repetitions
        const individualItem = {
          verseIndices: [i], // Just this verse
          repeatCount: repeatCount,
          label: `V${i + 1} (x${repeatCount})`
        };
        this.spacedPlaylist.push(individualItem);

        // Add cumulative verses with N repetitions (all verses up to current)
        const indices = Array.from({ length: i + 1 }, (_, idx) => idx);
        const cumulativeItem = {
          verseIndices: indices, // All verses from 0 to i
          repeatCount: repeatCount,
          label: `V1-V${i + 1} (x${repeatCount})`
        };
        this.spacedPlaylist.push(cumulativeItem);
      }

      console.log('[Murajah-Audio] Generated spaced playlist with', this.spacedPlaylist.length, 'items');
    },

    /**
     * Play a verse or sequence from spaced playlist
     */
    playSpacedItem(playlistIndex) {
      if (!this.spacedPlaylist || playlistIndex >= this.spacedPlaylist.length) {
        console.warn('[Murajah-Audio] Invalid playlist index:', playlistIndex);
        return;
      }

      const item = this.spacedPlaylist[playlistIndex];
      
      console.log('[Murajah-Audio] playSpacedItem:', {
        playlistIndex,
        label: item.label,
        verseIndices: item.verseIndices,
        repeatCount: item.repeatCount
      });
      
      // Store the current playlist item info
      this.currentPlaylistIndex = playlistIndex;
      this.currentSequenceIndices = item.verseIndices;
      this.currentSequencePosition = 0;
      this.currentSequenceRepeatCount = item.repeatCount || 1;
      this.currentSequenceRepeatPosition = 0;

      // Start playing the sequence from the beginning
      this.playNextVerseInSequence();
    },

    /**
     * Play next verse in current sequence
     */
    playNextVerseInSequence() {
      if (!this.currentSequenceIndices || this.currentSequenceIndices.length === 0) {
        console.warn('[Murajah-Audio] No sequence indices set');
        return;
      }

      const verseIndex = this.currentSequenceIndices[this.currentSequencePosition];
      this.currentVerseIndex = verseIndex;
      
      const verse = this.pageVerses[verseIndex];
      
      console.log('[Murajah-Audio] playNextVerseInSequence:', {
        sequencePosition: this.currentSequencePosition,
        sequenceRepeat: this.currentSequenceRepeatPosition + 1,
        totalRepeats: this.currentSequenceRepeatCount,
        verseIndex,
        chapter: verse.chapter,
        verse: verse.verse,
        sequenceIndices: this.currentSequenceIndices
      });
      
      const { primaryUrl, fallbackUrl } = this.getAudioUrl(verse);

      this.audioElement.src = primaryUrl;
      this.audioElement.onloadstart = () => {
        this.audioElement.addEventListener('error', () => {
          console.log('[Murajah-Audio] Primary URL failed, trying fallback');
          this.audioElement.src = fallbackUrl;
        }, { once: true });
      };

      this.audioElement.play().catch(error => {
        console.error('[Murajah] Audio playback error:', error);
      });

      this.isPlaying = true;
    },

    /**
     * Play a sequence of verses back-to-back (DEPRECATED - use playSpacedItem instead)
     */
    playVerseSequence(verseIndices) {
      if (!verseIndices || verseIndices.length === 0) {
        return;
      }

      // Store the sequence and reset position
      this.currentSequenceIndices = verseIndices;
      this.currentSequencePosition = 0;
      this.currentSequenceRepeatCount = 1;
      this.currentSequenceRepeatPosition = 0;

      // Start with the first verse in the sequence
      const firstVerseIndex = verseIndices[0];
      this.currentVerseIndex = firstVerseIndex;
      this.currentPlaylistIndex = this.spacedPlaylist.findIndex(
        item => item.verseIndices[0] === verseIndices[0] && 
                 item.verseIndices.length === verseIndices.length
      );

      const verse = this.pageVerses[firstVerseIndex];
      const { primaryUrl, fallbackUrl } = this.getAudioUrl(verse);

      this.audioElement.src = primaryUrl;
      this.audioElement.onloadstart = () => {
        this.audioElement.addEventListener('error', () => {
          this.audioElement.src = fallbackUrl;
        }, { once: true });
      };

      this.audioElement.play().catch(error => {
        console.error('[Murajah] Audio playback error:', error);
      });

      this.isPlaying = true;
    },

    getAudioUrl(verse) {
      const surah = verse.chapter;
      const ayah = verse.verse;
      const surahPadded = String(surah).padStart(3, '0');
      const ayahPadded = String(ayah).padStart(3, '0');

      let primaryUrl = '';
      let fallbackUrl = '';

      // Set URLs based on selected reciter
      switch (this.selectedReciter) {
        case 'shuraim':
          primaryUrl = `https://wasi0013.github.io/Murajah/recitations/sheikh_shuraim/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        case 'ali_jaber':
          primaryUrl = `https://wasi0013.github.io/Murajah/recitations/ali_jaber/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        case 'minshawy':
          primaryUrl = `https://everyayah.com/data/Minshawy_Murattal_128kbps/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        case 'ayyoub':
          primaryUrl = `https://everyayah.com/data/Muhammad_Ayyoub_128kbps/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        case 'abdul_basit':
          primaryUrl = `https://everyayah.com/data/Abdul_Basit_Murattal_192kbps/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        case 'alafasy':
          primaryUrl = `https://the-quran-project.github.io/Quran-Audio/Data/1/${surah}_${ayah}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Alafasy_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        case 'abu_bakr':
          primaryUrl = `https://everyayah.com/data/Abu_Bakr_Ash-Shaatree_128kbps/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        case 'nasser':
          primaryUrl = `https://everyayah.com/data/Nasser_Alqatami_128kbps/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        case 'yasser':
          primaryUrl = `https://everyayah.com/data/Yasser_Ad-Dussary_128kbps/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        case 'hani':
          primaryUrl = `https://everyayah.com/data/Hani_Rifai_192kbps/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
          break;
        default:
          // Default to Shuraim
          primaryUrl = `https://wasi0013.github.io/Murajah/recitations/sheikh_shuraim/${surahPadded}${ayahPadded}.mp3`;
          fallbackUrl = `https://everyayah.com/data/Shuraim_128kbps/${surahPadded}${ayahPadded}.mp3`;
      }

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
          // Start playback
          if (this.useSpacedRepetition && this.spacedPlaylist.length > 0) {
            this.playSpacedItem(0); // Start from first spaced item
          } else {
            this.playVerse(this.currentVerseIndex);
          }
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
      if (this.useSpacedRepetition && this.spacedPlaylist.length > 0) {
        // Move to next item in spaced playlist
        if (this.currentPlaylistIndex < this.spacedPlaylist.length - 1) {
          this.playSpacedItem(this.currentPlaylistIndex + 1);
        }
      } else {
        // Normal sequential playback
        if (this.currentVerseIndex < this.pageVerses.length - 1) {
          this.playVerse(this.currentVerseIndex + 1);
        }
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
      // Automatically enable auto-play when repeat is enabled
      if (this.repeatPlaylist && !this.autoPlayNext) {
        this.repeatPlaylist = false;
        console.log('[Murajah-Audio] Disabled repeat playlist with auto play toggle');
      }
    },

    /**
     * Toggle repeat entire playlist
     */
    toggleRepeatPlaylist() {
      this.repeatPlaylist = !this.repeatPlaylist;
      
      // Automatically enable auto-play when repeat is enabled
      if (this.repeatPlaylist && !this.autoPlayNext) {
        this.autoPlayNext = true;
        console.log('[Murajah-Audio] Auto-play enabled with repeat playlist');
      }
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
      console.log('[Murajah-Audio] onAudioEnded called', {
        autoPlayNext: this.autoPlayNext,
        useSpacedRepetition: this.useSpacedRepetition,
        spacedPlaylistLength: this.spacedPlaylist.length,
        currentSequencePosition: this.currentSequencePosition,
        currentSequenceIndicesLength: this.currentSequenceIndices?.length || 0,
        currentSequenceRepeatPosition: this.currentSequenceRepeatPosition,
        currentSequenceRepeatCount: this.currentSequenceRepeatCount,
        currentPlaylistIndex: this.currentPlaylistIndex
      });

      if (!this.autoPlayNext) {
        this.isPlaying = false;
        console.log('[Murajah-Audio] AutoPlay disabled, stopping');
        return;
      }

      if (this.useSpacedRepetition && this.spacedPlaylist.length > 0) {
        // In spaced repetition mode
        
        // Check if there are more verses in the current sequence to play
        if (this.currentSequencePosition < this.currentSequenceIndices.length - 1) {
          // Move to next verse in the current sequence
          console.log('[Murajah-Audio] Moving to next verse in sequence');
          this.currentSequencePosition++;
          this.playNextVerseInSequence();
        } else if (this.currentSequenceRepeatPosition < this.currentSequenceRepeatCount - 1) {
          // Current sequence finished, but need to repeat it again
          console.log('[Murajah-Audio] Repeating sequence:', {
            from: this.currentSequenceRepeatPosition + 1,
            to: this.currentSequenceRepeatPosition + 2,
            total: this.currentSequenceRepeatCount
          });
          this.currentSequenceRepeatPosition++;
          this.currentSequencePosition = 0; // Reset to start of sequence
          this.playNextVerseInSequence();
        } else {
          // Finished all repetitions of current sequence, move to next playlist item
          console.log('[Murajah-Audio] Sequence complete, moving to next playlist item', {
            current: this.currentPlaylistIndex,
            total: this.spacedPlaylist.length
          });
          if (this.currentPlaylistIndex < this.spacedPlaylist.length - 1) {
            this.playSpacedItem(this.currentPlaylistIndex + 1);
          } else {
            this.isPlaying = false;
            console.log('[Murajah-Audio] Spaced repetition completed!');
          }
        }
      } else {
        // Normal sequential playback
        if (this.currentVerseIndex < this.pageVerses.length - 1) {
          this.nextVerse();
        } else {
          // Reached end of playlist
          if (this.repeatPlaylist) {
            // Restart from beginning
            console.log('[Murajah-Audio] Restarting playlist from beginning');
            this.playVerse(0);
          } else {
            this.isPlaying = false;
          }
        }
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
    },
    useSpacedRepetition(newVal) {
      // Stop current playback
      this.audioElement.pause();
      this.isPlaying = false;
      this.audioElement.currentTime = 0;
      
      // Reset playback state
      this.currentVerseIndex = 0;
      this.currentTime = 0;
      this.currentPlaylistIndex = 0;
      this.currentSequenceIndices = [];
      this.currentSequencePosition = 0;
      this.currentSequenceRepeatCount = 0;
      this.currentSequenceRepeatPosition = 0;
      
      // Generate or clear playlist
      if (newVal && this.pageVerses.length > 0) {
        this.generateSpacedPlaylist();
        console.log('[Murajah-Audio] Spaced repetition enabled, generated playlist with', this.spacedPlaylist.length, 'items');
      } else {
        this.spacedPlaylist = [];
        console.log('[Murajah-Audio] Spaced repetition disabled');
      }
    },
    repeatCount(newVal, oldVal) {
      console.log('[Murajah-Audio] repeatCount changed from', oldVal, 'to', newVal);
      
      if (this.useSpacedRepetition && this.pageVerses.length > 0) {
        // Stop current playback
        this.audioElement.pause();
        this.isPlaying = false;
        this.audioElement.currentTime = 0;
        
        // Reset playback state
        this.currentVerseIndex = 0;
        this.currentTime = 0;
        this.currentPlaylistIndex = 0;
        this.currentSequenceIndices = [];
        this.currentSequencePosition = 0;
        this.currentSequenceRepeatCount = 0;
        this.currentSequenceRepeatPosition = 0;
        
        // Regenerate playlist with new repeat count
        this.generateSpacedPlaylist();
        console.log('[Murajah-Audio] Playlist regenerated with', this.spacedPlaylist.length, 'items');
      }
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
