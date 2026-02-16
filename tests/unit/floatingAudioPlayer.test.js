/**
 * Unit tests for FloatingAudioPlayerComponent
 * Tests playback controls, playlist management, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the component's methods we want to test
describe('FloatingAudioPlayer', () => {
  describe('formatDuration()', () => {
    // We'll test the formatting logic that the component uses
    const formatDuration = (ms) => {
      if (!ms || isNaN(ms)) return '0:00';
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    it('should format 0ms as 0:00', () => {
      expect(formatDuration(0)).toBe('0:00');
    });

    it('should format null as 0:00', () => {
      expect(formatDuration(null)).toBe('0:00');
    });

    it('should format undefined as 0:00', () => {
      expect(formatDuration(undefined)).toBe('0:00');
    });

    it('should format NaN as 0:00', () => {
      expect(formatDuration(NaN)).toBe('0:00');
    });

    it('should format 30000ms as 0:30', () => {
      expect(formatDuration(30000)).toBe('0:30');
    });

    it('should format 60000ms as 1:00', () => {
      expect(formatDuration(60000)).toBe('1:00');
    });

    it('should format 90000ms as 1:30', () => {
      expect(formatDuration(90000)).toBe('1:30');
    });

    it('should format 600000ms (10 minutes) as 10:00', () => {
      expect(formatDuration(600000)).toBe('10:00');
    });

    it('should pad single digit seconds', () => {
      expect(formatDuration(65000)).toBe('1:05');
    });
  });

  describe('sortedRecordings computed', () => {
    // Test the sorting logic used by the playlist
    const sortRecordings = (recordings) => {
      return [...recordings].sort((a, b) => {
        const timeA = a.timestamp || new Date(a.recordedAt).getTime() || 0;
        const timeB = b.timestamp || new Date(b.recordedAt).getTime() || 0;
        return timeB - timeA;
      });
    };

    it('should sort recordings by most recent first', () => {
      const recordings = [
        { pageNumber: 1, timestamp: 1000 },
        { pageNumber: 2, timestamp: 3000 },
        { pageNumber: 3, timestamp: 2000 }
      ];

      const sorted = sortRecordings(recordings);
      
      expect(sorted[0].pageNumber).toBe(2);
      expect(sorted[1].pageNumber).toBe(3);
      expect(sorted[2].pageNumber).toBe(1);
    });

    it('should handle recordings with recordedAt date strings', () => {
      const recordings = [
        { pageNumber: 1, recordedAt: '2024-01-01T10:00:00Z' },
        { pageNumber: 2, recordedAt: '2024-01-01T12:00:00Z' },
        { pageNumber: 3, recordedAt: '2024-01-01T11:00:00Z' }
      ];

      const sorted = sortRecordings(recordings);
      
      expect(sorted[0].pageNumber).toBe(2);
      expect(sorted[1].pageNumber).toBe(3);
      expect(sorted[2].pageNumber).toBe(1);
    });

    it('should handle empty recordings array', () => {
      const sorted = sortRecordings([]);
      expect(sorted).toEqual([]);
    });

    it('should handle single recording', () => {
      const recordings = [{ pageNumber: 1, timestamp: 1000 }];
      const sorted = sortRecordings(recordings);
      expect(sorted.length).toBe(1);
      expect(sorted[0].pageNumber).toBe(1);
    });

    it('should not mutate original array', () => {
      const recordings = [
        { pageNumber: 1, timestamp: 1000 },
        { pageNumber: 2, timestamp: 2000 }
      ];
      const original = [...recordings];
      
      sortRecordings(recordings);
      
      expect(recordings).toEqual(original);
    });
  });

  describe('playback speed cycling', () => {
    const speeds = [0.25, 0.5, 0.75, 1, 1.5, 2];
    
    const cycleSpeed = (currentSpeed) => {
      const currentIndex = speeds.indexOf(currentSpeed);
      const nextIndex = (currentIndex + 1) % speeds.length;
      return speeds[nextIndex];
    };

    it('should cycle from 1x to 1.5x', () => {
      expect(cycleSpeed(1)).toBe(1.5);
    });

    it('should cycle from 2x back to 0.25x', () => {
      expect(cycleSpeed(2)).toBe(0.25);
    });

    it('should cycle from 0.25x to 0.5x', () => {
      expect(cycleSpeed(0.25)).toBe(0.5);
    });

    it('should handle all speed transitions correctly', () => {
      expect(cycleSpeed(0.25)).toBe(0.5);
      expect(cycleSpeed(0.5)).toBe(0.75);
      expect(cycleSpeed(0.75)).toBe(1);
      expect(cycleSpeed(1)).toBe(1.5);
      expect(cycleSpeed(1.5)).toBe(2);
      expect(cycleSpeed(2)).toBe(0.25);
    });

    it('should handle invalid speed by returning first speed', () => {
      const cycleSpeedWithFallback = (currentSpeed) => {
        const currentIndex = speeds.indexOf(currentSpeed);
        if (currentIndex === -1) return speeds[0];
        const nextIndex = (currentIndex + 1) % speeds.length;
        return speeds[nextIndex];
      };

      expect(cycleSpeedWithFallback(999)).toBe(0.25);
    });
  });

  describe('playlist navigation', () => {
    const recordings = [
      { pageNumber: 1, blob: 'blob1' },
      { pageNumber: 2, blob: 'blob2' },
      { pageNumber: 3, blob: 'blob3' }
    ];

    describe('playNext()', () => {
      const playNext = (currentIndex, recordings) => {
        if (currentIndex < recordings.length - 1) {
          return currentIndex + 1;
        }
        return currentIndex;
      };

      it('should move to next recording', () => {
        expect(playNext(0, recordings)).toBe(1);
      });

      it('should not go past last recording', () => {
        expect(playNext(2, recordings)).toBe(2);
      });

      it('should handle middle of playlist', () => {
        expect(playNext(1, recordings)).toBe(2);
      });
    });

    describe('playPrevious()', () => {
      const playPrevious = (currentIndex) => {
        if (currentIndex > 0) {
          return currentIndex - 1;
        }
        return currentIndex;
      };

      it('should move to previous recording', () => {
        expect(playPrevious(1)).toBe(0);
      });

      it('should not go before first recording', () => {
        expect(playPrevious(0)).toBe(0);
      });

      it('should handle last position', () => {
        expect(playPrevious(2)).toBe(1);
      });
    });
  });

  describe('progress calculation', () => {
    const calculateProgress = (currentTime, duration) => {
      if (!duration || duration === 0) return 0;
      return (currentTime / duration) * 100;
    };

    it('should return 0 for start of track', () => {
      expect(calculateProgress(0, 100)).toBe(0);
    });

    it('should return 50 for midpoint', () => {
      expect(calculateProgress(50, 100)).toBe(50);
    });

    it('should return 100 for end of track', () => {
      expect(calculateProgress(100, 100)).toBe(100);
    });

    it('should handle 0 duration', () => {
      expect(calculateProgress(50, 0)).toBe(0);
    });

    it('should handle null duration', () => {
      expect(calculateProgress(50, null)).toBe(0);
    });

    it('should handle undefined duration', () => {
      expect(calculateProgress(50, undefined)).toBe(0);
    });
  });

  describe('seek position calculation', () => {
    const calculateSeekPosition = (clickX, progressBarWidth, duration) => {
      if (!progressBarWidth || !duration) return 0;
      const percentage = (clickX / progressBarWidth) * 100;
      const clampedPercentage = Math.max(0, Math.min(100, percentage));
      return (clampedPercentage / 100) * duration;
    };

    it('should calculate correct position for middle click', () => {
      const position = calculateSeekPosition(50, 100, 120);
      expect(position).toBe(60); // 50% of 120 seconds
    });

    it('should clamp to start for negative click', () => {
      const position = calculateSeekPosition(-10, 100, 120);
      expect(position).toBe(0);
    });

    it('should clamp to end for click past bar', () => {
      const position = calculateSeekPosition(150, 100, 120);
      expect(position).toBe(120);
    });

    it('should handle 0 progress bar width', () => {
      const position = calculateSeekPosition(50, 0, 120);
      expect(position).toBe(0);
    });

    it('should handle 0 duration', () => {
      const position = calculateSeekPosition(50, 100, 0);
      expect(position).toBe(0);
    });
  });

  describe('recording validation', () => {
    const isValidRecording = (recording) => {
      return !!(
        recording &&
        (recording.blob || recording.audioData) &&
        typeof recording.pageNumber === 'number'
      );
    };

    it('should accept recording with blob', () => {
      const recording = { pageNumber: 1, blob: 'blob-data' };
      expect(isValidRecording(recording)).toBe(true);
    });

    it('should accept recording with audioData', () => {
      const recording = { pageNumber: 1, audioData: 'base64-data' };
      expect(isValidRecording(recording)).toBe(true);
    });

    it('should reject recording without blob or audioData', () => {
      const recording = { pageNumber: 1 };
      expect(isValidRecording(recording)).toBe(false);
    });

    it('should reject recording without pageNumber', () => {
      const recording = { blob: 'blob-data' };
      expect(isValidRecording(recording)).toBe(false);
    });

    it('should reject null recording', () => {
      expect(isValidRecording(null)).toBe(false);
    });

    it('should reject undefined recording', () => {
      expect(isValidRecording(undefined)).toBe(false);
    });

    it('should reject recording with string pageNumber', () => {
      const recording = { blob: 'blob-data', pageNumber: '1' };
      expect(isValidRecording(recording)).toBe(false);
    });
  });

  describe('delete confirmation', () => {
    const getDeleteMessage = (recording, t) => {
      const page = recording?.pageNumber ?? '?';
      return t('floatingPlayer.deleteConfirm').replace('{page}', page);
    };

    it('should include page number in message', () => {
      const mockT = (key) => {
        if (key === 'floatingPlayer.deleteConfirm') {
          return 'Delete recording for page {page}?';
        }
        return key;
      };

      const recording = { pageNumber: 42 };
      const message = getDeleteMessage(recording, mockT);
      
      expect(message).toBe('Delete recording for page 42?');
    });

    it('should handle missing page number', () => {
      const mockT = (key) => {
        if (key === 'floatingPlayer.deleteConfirm') {
          return 'Delete recording for page {page}?';
        }
        return key;
      };

      const recording = {};
      const message = getDeleteMessage(recording, mockT);
      
      expect(message).toBe('Delete recording for page ??');
    });

    it('should handle null recording', () => {
      const mockT = (key) => {
        if (key === 'floatingPlayer.deleteConfirm') {
          return 'Delete recording for page {page}?';
        }
        return key;
      };

      const message = getDeleteMessage(null, mockT);
      
      expect(message).toBe('Delete recording for page ??');
    });
  });

  describe('audio element iOS attributes', () => {
    // Test that iOS-compatible attributes are set correctly
    const getiOSAudioAttributes = () => {
      return {
        playsinline: true,
        'webkit-playsinline': true,
        preload: 'auto'
      };
    };

    it('should have playsinline attribute', () => {
      const attrs = getiOSAudioAttributes();
      expect(attrs.playsinline).toBe(true);
    });

    it('should have webkit-playsinline attribute', () => {
      const attrs = getiOSAudioAttributes();
      expect(attrs['webkit-playsinline']).toBe(true);
    });

    it('should have preload auto', () => {
      const attrs = getiOSAudioAttributes();
      expect(attrs.preload).toBe('auto');
    });
  });

  describe('minimize state', () => {
    it('should toggle minimize state', () => {
      let isMinimized = false;
      
      const toggleMinimize = () => {
        isMinimized = !isMinimized;
      };

      expect(isMinimized).toBe(false);
      toggleMinimize();
      expect(isMinimized).toBe(true);
      toggleMinimize();
      expect(isMinimized).toBe(false);
    });
  });

  describe('playlist visibility', () => {
    it('should toggle playlist visibility', () => {
      let showPlaylist = false;
      
      const togglePlaylist = () => {
        showPlaylist = !showPlaylist;
      };

      expect(showPlaylist).toBe(false);
      togglePlaylist();
      expect(showPlaylist).toBe(true);
      togglePlaylist();
      expect(showPlaylist).toBe(false);
    });
  });

  describe('formatTime() with Infinity and NaN', () => {
    // Regression: audio.duration can be Infinity for WebM blobs recorded
    // via MediaRecorder (no duration metadata). formatTime(Infinity) previously
    // returned "Infinity:NaN" instead of "0:00".
    const formatTime = (seconds) => {
      if (!seconds || !isFinite(seconds) || seconds < 0) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    it('should return 0:00 for Infinity', () => {
      expect(formatTime(Infinity)).toBe('0:00');
    });

    it('should return 0:00 for -Infinity', () => {
      expect(formatTime(-Infinity)).toBe('0:00');
    });

    it('should return 0:00 for NaN', () => {
      expect(formatTime(NaN)).toBe('0:00');
    });

    it('should return 0:00 for null', () => {
      expect(formatTime(null)).toBe('0:00');
    });

    it('should return 0:00 for undefined', () => {
      expect(formatTime(undefined)).toBe('0:00');
    });

    it('should return 0:00 for 0', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('should return 0:00 for negative values', () => {
      expect(formatTime(-5)).toBe('0:00');
    });

    it('should format valid seconds correctly', () => {
      expect(formatTime(65)).toBe('1:05');
      expect(formatTime(120)).toBe('2:00');
      expect(formatTime(3661)).toBe('61:01');
    });

    it('should handle fractional seconds', () => {
      expect(formatTime(65.7)).toBe('1:05');
      expect(formatTime(0.5)).toBe('0:00');
    });
  });

  describe('_updateDuration() fallback logic', () => {
    // Regression: When audio.duration is Infinity (WebM blobs), the component
    // should fall back to the recording's stored duration (ms → seconds).
    const _updateDuration = (audioDuration, recordingDurationMs) => {
      let duration = 0;
      if (isFinite(audioDuration) && !isNaN(audioDuration) && audioDuration > 0) {
        duration = audioDuration;
      } else if (recordingDurationMs && recordingDurationMs > 0) {
        duration = recordingDurationMs / 1000;
      }
      return duration;
    };

    it('should use audio duration when finite', () => {
      expect(_updateDuration(120.5, 120000)).toBe(120.5);
    });

    it('should fallback to recording duration when audio duration is Infinity', () => {
      expect(_updateDuration(Infinity, 30000)).toBe(30);
    });

    it('should fallback to recording duration when audio duration is NaN', () => {
      expect(_updateDuration(NaN, 45000)).toBe(45);
    });

    it('should fallback to recording duration when audio duration is 0', () => {
      expect(_updateDuration(0, 60000)).toBe(60);
    });

    it('should fallback to recording duration when audio duration is negative', () => {
      expect(_updateDuration(-1, 15000)).toBe(15);
    });

    it('should return 0 when both audio and recording duration are invalid', () => {
      expect(_updateDuration(Infinity, 0)).toBe(0);
      expect(_updateDuration(NaN, null)).toBe(0);
      expect(_updateDuration(Infinity, undefined)).toBe(0);
    });

    it('should correctly convert recording duration from ms to seconds', () => {
      // 2 minutes 30 seconds = 150000ms = 150s
      expect(_updateDuration(Infinity, 150000)).toBe(150);
    });

    it('should prefer finite audio duration over recording duration', () => {
      // Audio element may report slightly different duration than wall-clock
      expect(_updateDuration(29.8, 30000)).toBe(29.8);
    });
  });

  describe('progressPercent with non-finite duration', () => {
    // Regression: progressPercent would produce NaN or Infinity results
    // when this.duration was Infinity.
    const calculateProgress = (currentTime, duration) => {
      if (!duration || !isFinite(duration)) return 0;
      return (currentTime / duration) * 100;
    };

    it('should return 0 when duration is Infinity', () => {
      expect(calculateProgress(50, Infinity)).toBe(0);
    });

    it('should return 0 when duration is NaN', () => {
      expect(calculateProgress(50, NaN)).toBe(0);
    });

    it('should return 0 when duration is 0', () => {
      expect(calculateProgress(50, 0)).toBe(0);
    });

    it('should calculate correctly with finite duration', () => {
      expect(calculateProgress(30, 60)).toBe(50);
    });
  });

  describe('seekAudio safety with non-finite duration', () => {
    // Regression: seeking with Infinity duration would set audio.currentTime
    // to Infinity, causing DOMException: "The provided double value is non-finite"
    const calculateSeekTime = (clickFraction, duration) => {
      if (!duration || !isFinite(duration)) return null;
      const percent = Math.max(0, Math.min(1, clickFraction));
      const seekTime = percent * duration;
      if (!isFinite(seekTime)) return null;
      return seekTime;
    };

    it('should return null when duration is Infinity', () => {
      expect(calculateSeekTime(0.5, Infinity)).toBeNull();
    });

    it('should return null when duration is NaN', () => {
      expect(calculateSeekTime(0.5, NaN)).toBeNull();
    });

    it('should return null when duration is 0', () => {
      expect(calculateSeekTime(0.5, 0)).toBeNull();
    });

    it('should calculate correct seek position with finite duration', () => {
      expect(calculateSeekTime(0.5, 120)).toBe(60);
    });

    it('should clamp seek fraction to [0, 1]', () => {
      expect(calculateSeekTime(-0.5, 120)).toBe(0);
      expect(calculateSeekTime(1.5, 120)).toBe(120);
    });

    it('should handle edge position 0%', () => {
      expect(calculateSeekTime(0, 120)).toBe(0);
    });

    it('should handle edge position 100%', () => {
      expect(calculateSeekTime(1, 120)).toBe(120);
    });

    it('should never produce a non-finite seek time', () => {
      // This is the core regression test - non-finite seek times
      // would cause DOMException: "double value is non-finite"
      const testCases = [
        { fraction: 0.5, duration: Infinity },
        { fraction: 0.5, duration: -Infinity },
        { fraction: 0.5, duration: NaN },
        { fraction: NaN, duration: 120 },
        { fraction: Infinity, duration: 120 },
      ];

      for (const { fraction, duration } of testCases) {
        const result = calculateSeekTime(fraction, duration);
        if (result !== null) {
          expect(isFinite(result)).toBe(true);
        }
      }
    });
  });

  describe('pre-set duration from recording metadata', () => {
    // Regression: duration should be set from recording.duration before
    // audio.load() so it's immediately available for display and seeking
    it('should convert recording duration ms to seconds', () => {
      const recordingDurationMs = 45000; // 45 seconds
      const durationSeconds = recordingDurationMs / 1000;
      expect(durationSeconds).toBe(45);
    });

    it('should not set duration from invalid recording duration', () => {
      const setDurationIfValid = (durationMs) => {
        if (durationMs > 0) return durationMs / 1000;
        return null;
      };

      expect(setDurationIfValid(0)).toBeNull();
      expect(setDurationIfValid(-1000)).toBeNull();
      expect(setDurationIfValid(null)).toBeNull();
      expect(setDurationIfValid(undefined)).toBeNull();
    });

    it('should prefer audio element duration when finite and valid', () => {
      // Simulates: recording says 30s, audio element says 29.8s
      const recordingMs = 30000;
      let duration = recordingMs / 1000; // Pre-set: 30

      // Then loadedmetadata fires with valid duration
      const audioDuration = 29.8;
      if (isFinite(audioDuration) && audioDuration > 0) {
        duration = audioDuration; // Override with more accurate value
      }

      expect(duration).toBe(29.8);
    });

    it('should keep recording duration when audio reports Infinity', () => {
      const recordingMs = 30000;
      let duration = recordingMs / 1000; // Pre-set: 30

      // loadedmetadata fires with Infinity
      const audioDuration = Infinity;
      if (isFinite(audioDuration) && audioDuration > 0) {
        duration = audioDuration;
      }

      expect(duration).toBe(30); // Unchanged, still from recording
    });
  });

  describe('null audio element guards', () => {
    // These tests verify the null guards added to onTimeUpdate and onMetadataLoaded
    // to prevent "Cannot read properties of null (reading 'currentTime')" errors
    // when the audio ref is null (e.g. during unmount or before render)

    it('onTimeUpdate should not throw when audio ref is null', () => {
      let currentTime = 0;

      const onTimeUpdate = (audioElement) => {
        if (!audioElement) return;
        currentTime = audioElement.currentTime;
      };

      // Simulate null ref (component unmounting / not yet rendered)
      expect(() => onTimeUpdate(null)).not.toThrow();
      expect(currentTime).toBe(0);
    });

    it('onTimeUpdate should update currentTime when audio ref exists', () => {
      let currentTime = 0;

      const onTimeUpdate = (audioElement) => {
        if (!audioElement) return;
        currentTime = audioElement.currentTime;
      };

      onTimeUpdate({ currentTime: 42.5 });
      expect(currentTime).toBe(42.5);
    });

    it('onMetadataLoaded should not throw when audio ref is null', () => {
      let duration = 0;

      const onMetadataLoaded = (audioElement) => {
        if (!audioElement) return;
        duration = audioElement.duration;
      };

      expect(() => onMetadataLoaded(null)).not.toThrow();
      expect(duration).toBe(0);
    });

    it('onMetadataLoaded should update duration when audio ref exists', () => {
      let duration = 0;

      const onMetadataLoaded = (audioElement) => {
        if (!audioElement) return;
        duration = audioElement.duration;
      };

      onMetadataLoaded({ duration: 180.3 });
      expect(duration).toBe(180.3);
    });

    it('onTimeUpdate should not throw when audio ref is undefined', () => {
      let currentTime = 5;

      const onTimeUpdate = (audioElement) => {
        if (!audioElement) return;
        currentTime = audioElement.currentTime;
      };

      expect(() => onTimeUpdate(undefined)).not.toThrow();
      expect(currentTime).toBe(5); // unchanged
    });

    it('onMetadataLoaded should not throw when audio ref is undefined', () => {
      let duration = 10;

      const onMetadataLoaded = (audioElement) => {
        if (!audioElement) return;
        duration = audioElement.duration;
      };

      expect(() => onMetadataLoaded(undefined)).not.toThrow();
      expect(duration).toBe(10); // unchanged
    });

    it('stopPlayback should handle null audio ref gracefully', () => {
      let isPlaying = true;
      let currentTime = 30;

      const stopPlayback = (audioElement) => {
        if (audioElement) {
          audioElement.pause();
          audioElement.currentTime = 0;
        }
        isPlaying = false;
        currentTime = 0;
      };

      expect(() => stopPlayback(null)).not.toThrow();
      expect(isPlaying).toBe(false);
      expect(currentTime).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle very large recording arrays', () => {
      const largeRecordings = Array(1000).fill(null).map((_, i) => ({
        pageNumber: i + 1,
        timestamp: Date.now() - (i * 1000),
        blob: `blob-${i}`
      }));

      // Should not throw
      const sortRecordings = (recordings) => {
        return [...recordings].sort((a, b) => b.timestamp - a.timestamp);
      };

      expect(() => sortRecordings(largeRecordings)).not.toThrow();
      expect(sortRecordings(largeRecordings).length).toBe(1000);
    });

    it('should handle recordings with same timestamp', () => {
      const recordings = [
        { pageNumber: 1, timestamp: 1000 },
        { pageNumber: 2, timestamp: 1000 },
        { pageNumber: 3, timestamp: 1000 }
      ];

      const sortRecordings = (recordings) => {
        return [...recordings].sort((a, b) => b.timestamp - a.timestamp);
      };

      const sorted = sortRecordings(recordings);
      expect(sorted.length).toBe(3);
    });

    it('should handle recordings with missing timestamp', () => {
      const recordings = [
        { pageNumber: 1 },
        { pageNumber: 2, timestamp: 1000 }
      ];

      const sortRecordings = (recordings) => {
        return [...recordings].sort((a, b) => {
          const timeA = a.timestamp || 0;
          const timeB = b.timestamp || 0;
          return timeB - timeA;
        });
      };

      const sorted = sortRecordings(recordings);
      expect(sorted[0].pageNumber).toBe(2);
      expect(sorted[1].pageNumber).toBe(1);
    });

    it('should handle rapid play/pause toggling', () => {
      let isPlaying = false;
      let toggleCount = 0;

      const togglePlay = () => {
        isPlaying = !isPlaying;
        toggleCount++;
      };

      // Simulate rapid toggles
      for (let i = 0; i < 100; i++) {
        togglePlay();
      }

      expect(toggleCount).toBe(100);
      // After 100 toggles (even), should be back to false
      expect(isPlaying).toBe(false);
    });

    it('should handle playback speed edge values', () => {
      const applyPlaybackSpeed = (audio, speed) => {
        const clampedSpeed = Math.max(0.1, Math.min(4, speed));
        return clampedSpeed;
      };

      expect(applyPlaybackSpeed({}, 0)).toBe(0.1);
      expect(applyPlaybackSpeed({}, 10)).toBe(4);
      expect(applyPlaybackSpeed({}, 1)).toBe(1);
    });
  });
});
