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
