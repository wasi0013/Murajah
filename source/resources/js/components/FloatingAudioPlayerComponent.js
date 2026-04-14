/**
 * Floating Audio Player Component
 * A mobile-responsive floating audio player for playing recorded recitations
 * Features: play/pause/stop, playback speed, expandable playlist, hideable
 */

import Logger from '../utils/logger.js';

export const FloatingAudioPlayerComponent = {
  template: `
    <div v-if="recordings.length > 0" class="floating-audio-player-container">
      <!-- Minimized Toggle Button (when player is hidden) -->
      <button 
        v-if="isMinimized"
        @click="toggleMinimize"
        class="floating-toggle-btn"
        :title="$t('floatingPlayer.show')"
      >
        <i class="fas fa-headphones"></i>
        <span class="recording-badge" v-if="recordings.length">{{ recordings.length }}</span>
      </button>

      <!-- Main Floating Player -->
      <div 
        v-else
        class="floating-audio-player"
        :class="{ 'playlist-expanded': showPlaylist }"
      >
        <!-- Collapse/Minimize Button -->
        <button 
          @click="toggleMinimize" 
          class="minimize-btn"
          :title="$t('floatingPlayer.hide')"
        >
          <i class="fas fa-chevron-down"></i>
        </button>

        <!-- Now Playing Info -->
        <div class="now-playing" @click="togglePlaylist">
          <div class="track-info">
            <div class="track-title" v-if="currentRecording">
              <i class="fas fa-file-audio text-blue-500"></i>
              <span>{{ $t('floatingPlayer.page') }} {{ currentRecording.pageNumber }}</span>
            </div>
            <div class="track-title text-gray-400" v-else>
              <i class="fas fa-headphones"></i>
              <span>{{ $t('floatingPlayer.selectRecording') }}</span>
            </div>
            <div class="track-meta" v-if="currentRecording">
              <span class="duration">{{ formatDuration(currentRecording.duration) }}</span>
              <span class="separator">•</span>
              <span class="date">{{ currentRecording.recordedAt }}</span>
            </div>
          </div>
          <button class="playlist-toggle-btn" :title="showPlaylist ? $t('floatingPlayer.hidePlaylist') : $t('floatingPlayer.showPlaylist')">
            <i class="fas" :class="showPlaylist ? 'fa-chevron-down' : 'fa-chevron-up'"></i>
          </button>
        </div>

        <!-- Progress Bar -->
        <div class="progress-container" v-if="currentRecording" @click="seekAudio">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <div class="time-display">
            <span>{{ formatTime(currentTime) }}</span>
            <span>{{ formatTime(duration) }}</span>
          </div>
        </div>

        <!-- Control Buttons -->
        <div class="controls">
          <!-- Playback Speed -->
          <div class="speed-control">
            <button @click="cycleSpeed" class="speed-btn" :title="$t('floatingPlayer.playbackSpeed')">
              {{ playbackSpeed }}x
            </button>
          </div>

          <!-- Main Controls -->
          <div class="main-controls">
            <button 
              @click="previousTrack" 
              class="control-btn"
              :disabled="currentIndex <= 0"
              :title="$t('floatingPlayer.previous')"
            >
              <i class="fas fa-step-backward"></i>
            </button>

            <button 
              @click="togglePlayPause" 
              class="control-btn play-btn"
              :disabled="!currentRecording"
              :title="isPlaying ? $t('floatingPlayer.pause') : $t('floatingPlayer.play')"
            >
              <i class="fas" :class="isPlaying ? 'fa-pause' : 'fa-play'"></i>
            </button>

            <button 
              @click="stopPlayback" 
              class="control-btn"
              :disabled="!isPlaying && currentTime === 0"
              :title="$t('floatingPlayer.stop')"
            >
              <i class="fas fa-stop"></i>
            </button>

            <button 
              @click="nextTrack" 
              class="control-btn"
              :disabled="currentIndex >= recordings.length - 1"
              :title="$t('floatingPlayer.next')"
            >
              <i class="fas fa-step-forward"></i>
            </button>
          </div>

          <!-- Delete Button -->
          <div class="delete-control">
            <button 
              @click="confirmDelete" 
              class="delete-btn"
              :disabled="!currentRecording"
              :title="$t('floatingPlayer.delete')"
            >
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>

        <!-- Expandable Playlist -->
        <div v-if="showPlaylist" class="playlist-panel">
          <div class="playlist-header">
            <h4>{{ $t('floatingPlayer.recentRecordings') }} ({{ recordings.length }})</h4>
          </div>
          <div class="playlist-items">
            <div 
              v-for="(recording, index) in sortedRecordings" 
              :key="recording.timestamp || index"
              class="playlist-item"
              :class="{ 'active': currentRecording && currentRecording.timestamp === recording.timestamp }"
              @click="selectRecording(index)"
            >
              <div class="playlist-item-info">
                <div class="playlist-item-title">
                  <i class="fas fa-file-audio"></i>
                  {{ $t('floatingPlayer.page') }} {{ recording.pageNumber }}
                </div>
                <div class="playlist-item-meta">
                  {{ formatDuration(recording.duration) }} • {{ recording.recordedAt }}
                </div>
              </div>
              <div class="playlist-item-actions">
                <button 
                  @click.stop="playRecording(index)" 
                  class="playlist-action-btn"
                  :title="$t('floatingPlayer.play')"
                >
                  <i class="fas" :class="isPlayingIndex(index) ? 'fa-pause' : 'fa-play'"></i>
                </button>
                <button 
                  @click.stop="deleteRecording(index)" 
                  class="playlist-action-btn delete"
                  :title="$t('floatingPlayer.delete')"
                >
                  <i class="fas fa-trash-alt"></i>
                </button>
              </div>
            </div>
            <div v-if="recordings.length === 0" class="playlist-empty">
              {{ $t('floatingPlayer.noRecordings') }}
            </div>
          </div>
        </div>
      </div>

      <!-- Hidden Audio Element -->
      <audio 
        ref="audioElement"
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onMetadataLoaded"
        @durationchange="onDurationChange"
        @ended="onEnded"
        @error="onError"
        playsinline
        webkit-playsinline
      ></audio>
    </div>
  `,

  props: {
    recordings: {
      type: Array,
      default: () => []
    },
    onDelete: {
      type: Function,
      default: null
    },
    currentLocale: {
      type: String,
      default: 'en'
    }
  },

  data() {
    return {
      isMinimized: false,
      showPlaylist: false,
      isPlaying: false,
      currentIndex: -1,
      currentTime: 0,
      duration: 0,
      playbackSpeed: 1,
      speedOptions: [0.25, 0.5, 0.75, 1, 1.5, 2],
      currentBlobUrl: null
    };
  },

  computed: {
    currentRecording() {
      if (this.currentIndex >= 0 && this.currentIndex < this.recordings.length) {
        return this.sortedRecordings[this.currentIndex];
      }
      return null;
    },
    sortedRecordings() {
      // Recordings are expected to be kept pre-sorted (newest first)
      // before they are passed into this component.
      return this.recordings;
    },
    progressPercent() {
      if (!this.duration || !isFinite(this.duration)) return 0;
      return (this.currentTime / this.duration) * 100;
    }
  },

  watch: {
    recordings: {
      handler(newVal) {
        // Auto-select first recording if none selected
        if (newVal.length > 0 && this.currentIndex === -1) {
          this.currentIndex = 0;
        }
        // Reset if current recording was deleted
        if (this.currentIndex >= newVal.length) {
          this.currentIndex = newVal.length - 1;
        }
      },
      immediate: true
    }
  },

  methods: {
    toggleMinimize() {
      this.isMinimized = !this.isMinimized;
      if (this.isMinimized) {
        this.showPlaylist = false;
      }
    },

    togglePlaylist() {
      this.showPlaylist = !this.showPlaylist;
    },

    selectRecording(index) {
      const wasPlaying = this.isPlaying;
      this.stopPlayback();
      this.currentIndex = index;
      if (wasPlaying) {
        this.$nextTick(() => this.playCurrentRecording());
      }
    },

    isPlayingIndex(index) {
      return this.isPlaying && this.currentIndex === index;
    },

    async playRecording(index) {
      if (this.currentIndex === index && this.isPlaying) {
        this.togglePlayPause();
      } else {
        this.stopPlayback();
        this.currentIndex = index;
        await this.$nextTick();
        this.playCurrentRecording();
      }
    },

    async playCurrentRecording() {
      const recording = this.currentRecording;
      if (!recording || !recording.blob) {
        console.error('[Murajah] No recording or blob available');
        return;
      }

      try {
        // Revoke previous blob URL
        if (this.currentBlobUrl) {
          URL.revokeObjectURL(this.currentBlobUrl);
        }

        // Create new blob URL
        this.currentBlobUrl = URL.createObjectURL(recording.blob);
        
        // Pre-set duration from recording metadata (ms → seconds)
        // This ensures duration is available even if audio.duration reports Infinity
        if (recording.duration > 0) {
          this.duration = recording.duration / 1000;
        }
        
        const audio = this.$refs.audioElement;
        audio.src = this.currentBlobUrl;
        audio.playbackRate = this.playbackSpeed;
        audio.load();
        
        await audio.play();
        this.isPlaying = true;
        
        Logger.log('[Murajah] Playing recording', {
          page: recording.pageNumber,
          duration: recording.duration,
          mimeType: recording.mimeType || recording.blob.type
        });
      } catch (error) {
        console.error('[Murajah] Playback error:', error);
        this.isPlaying = false;
      }
    },

    togglePlayPause() {
      const audio = this.$refs.audioElement;
      if (!audio) return;
      
      if (this.isPlaying) {
        audio.pause();
        this.isPlaying = false;
      } else if (this.currentRecording) {
        if (audio.src) {
          audio.play();
          this.isPlaying = true;
        } else {
          this.playCurrentRecording();
        }
      }
    },

    stopPlayback() {
      const audio = this.$refs.audioElement;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
      }
      this.isPlaying = false;
      this.currentTime = 0;
      // Revoke blob URL to prevent memory leak
      if (this.currentBlobUrl) {
        URL.revokeObjectURL(this.currentBlobUrl);
        this.currentBlobUrl = null;
      }
    },

    previousTrack() {
      if (this.currentIndex > 0) {
        const wasPlaying = this.isPlaying;
        this.stopPlayback();
        this.currentIndex--;
        if (wasPlaying) {
          this.$nextTick(() => this.playCurrentRecording());
        }
      }
    },

    nextTrack() {
      if (this.currentIndex < this.recordings.length - 1) {
        const wasPlaying = this.isPlaying;
        this.stopPlayback();
        this.currentIndex++;
        if (wasPlaying) {
          this.$nextTick(() => this.playCurrentRecording());
        }
      }
    },

    cycleSpeed() {
      const currentIdx = this.speedOptions.indexOf(this.playbackSpeed);
      const nextIdx = (currentIdx + 1) % this.speedOptions.length;
      this.playbackSpeed = this.speedOptions[nextIdx];
      
      const audio = this.$refs.audioElement;
      if (audio) {
        audio.playbackRate = this.playbackSpeed;
      }
    },

    seekAudio(event) {
      const audio = this.$refs.audioElement;
      if (!audio || !this.duration || !isFinite(this.duration)) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const seekTime = percent * this.duration;
      if (isFinite(seekTime)) {
        audio.currentTime = seekTime;
      }
    },

    confirmDelete() {
      if (!this.currentRecording) return;
      
      const confirmed = confirm(this.$t('floatingPlayer.deleteConfirm', { page: this.currentRecording.pageNumber }));
      if (confirmed) {
        this.deleteRecording(this.currentIndex);
      }
    },

    deleteRecording(index) {
      const recording = this.sortedRecordings[index];
      if (!recording) return;

      if (this.currentIndex === index) {
        this.stopPlayback();
      }

      if (this.onDelete) {
        this.onDelete(index);
      }

      // Adjust current index if needed
      if (index <= this.currentIndex && this.currentIndex > 0) {
        this.currentIndex--;
      }
    },

    onTimeUpdate() {
      const audio = this.$refs.audioElement;
      if (!audio) return;
      this.currentTime = audio.currentTime;
    },

    onMetadataLoaded() {
      const audio = this.$refs.audioElement;
      if (!audio) return;
      this._updateDuration(audio.duration);
    },

    onDurationChange() {
      const audio = this.$refs.audioElement;
      if (!audio) return;
      this._updateDuration(audio.duration);
    },

    /**
     * Update duration, falling back to recording's stored duration
     * when the audio element reports Infinity (common with WebM blobs)
     */
    _updateDuration(audioDuration) {
      if (isFinite(audioDuration) && !isNaN(audioDuration) && audioDuration > 0) {
        this.duration = audioDuration;
      } else if (this.currentRecording && this.currentRecording.duration > 0) {
        // Fallback: recording.duration is in milliseconds, convert to seconds
        this.duration = this.currentRecording.duration / 1000;
      }
    },

    onEnded() {
      this.isPlaying = false;
      // Auto-play next track
      if (this.currentIndex < this.recordings.length - 1) {
        this.nextTrack();
        this.playCurrentRecording();
      } else {
        this.currentTime = 0;
      }
    },

    onError(event) {
      console.error('[Murajah] Audio playback error:', event);
      this.isPlaying = false;
    },

    formatDuration(ms) {
      if (!ms || ms < 0) return '0:00';
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },

    formatTime(seconds) {
      if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  },

  beforeUnmount() {
    // Cleanup blob URL
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
    }
    // Stop audio
    const audio = this.$refs.audioElement;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
  }
};

export default FloatingAudioPlayerComponent;
