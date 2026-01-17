/**
 * Unit tests for AudioRecorder class
 * Tests audio recording, playback, iOS compatibility, and MIME type handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the Logger module
vi.mock('../../source/resources/js/utils/logger.js', () => ({
  default: {
    MODULES: { AUDIO: 'audio' },
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Import after mocking
import { AudioRecorder } from '../../source/resources/js/utils/audioRecorder.js';

describe('AudioRecorder', () => {
  let originalNavigator;
  let originalMediaRecorder;
  let originalURL;

  beforeEach(() => {
    // Store originals
    originalNavigator = global.navigator;
    originalMediaRecorder = global.MediaRecorder;
    originalURL = global.URL;

    // Setup basic URL mock
    global.URL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    };
  });

  afterEach(() => {
    // Restore originals
    global.navigator = originalNavigator;
    global.MediaRecorder = originalMediaRecorder;
    global.URL = originalURL;
    vi.clearAllMocks();
  });

  describe('isSupported()', () => {
    it('should return true when all APIs are available', () => {
      global.navigator = {
        mediaDevices: {
          getUserMedia: vi.fn()
        }
      };
      global.MediaRecorder = vi.fn();

      expect(AudioRecorder.isSupported()).toBe(true);
    });

    it('should return false when mediaDevices is missing', () => {
      global.navigator = {};
      global.MediaRecorder = vi.fn();

      expect(AudioRecorder.isSupported()).toBe(false);
    });

    it('should return false when getUserMedia is missing', () => {
      global.navigator = {
        mediaDevices: {}
      };
      global.MediaRecorder = vi.fn();

      expect(AudioRecorder.isSupported()).toBe(false);
    });

    it('should return false when MediaRecorder is missing', () => {
      global.navigator = {
        mediaDevices: {
          getUserMedia: vi.fn()
        }
      };
      global.MediaRecorder = undefined;

      expect(AudioRecorder.isSupported()).toBe(false);
    });
  });

  describe('isIOS()', () => {
    it('should detect iPhone', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5
      };

      expect(AudioRecorder.isIOS()).toBe(true);
    });

    it('should detect iPad', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)',
        platform: 'iPad',
        maxTouchPoints: 5
      };

      expect(AudioRecorder.isIOS()).toBe(true);
    });

    it('should detect iPod', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)',
        platform: 'iPod',
        maxTouchPoints: 5
      };

      expect(AudioRecorder.isIOS()).toBe(true);
    });

    it('should detect iPad running as desktop (MacIntel with touch)', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5
      };

      expect(AudioRecorder.isIOS()).toBe(true);
    });

    it('should not detect regular Mac as iOS', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 0
      };

      expect(AudioRecorder.isIOS()).toBe(false);
    });

    it('should not detect Android as iOS', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6)',
        platform: 'Linux armv8l',
        maxTouchPoints: 5
      };

      expect(AudioRecorder.isIOS()).toBe(false);
    });

    it('should not detect Windows as iOS', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 0
      };

      expect(AudioRecorder.isIOS()).toBe(false);
    });
  });

  describe('getSupportedMimeType()', () => {
    it('should return audio/mp4 for iOS when supported', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5
      };
      global.MediaRecorder = {
        isTypeSupported: vi.fn((type) => type === 'audio/mp4')
      };

      const mimeType = AudioRecorder.getSupportedMimeType();
      expect(mimeType).toBe('audio/mp4');
    });

    it('should fallback to empty string for iOS when no formats supported', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        platform: 'iPhone',
        maxTouchPoints: 5
      };
      global.MediaRecorder = {
        isTypeSupported: vi.fn(() => false)
      };

      const mimeType = AudioRecorder.getSupportedMimeType();
      expect(mimeType).toBe('');
    });

    it('should check mp4 first even on non-iOS when supported', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6) Chrome/100',
        platform: 'Linux armv8l',
        maxTouchPoints: 5
      };
      global.MediaRecorder = {
        isTypeSupported: vi.fn((type) => 
          type === 'audio/mp4' || type === 'audio/webm;codecs=opus' || type === 'audio/webm'
        )
      };

      // mp4 is first in priority, so it should be selected
      const mimeType = AudioRecorder.getSupportedMimeType();
      expect(mimeType).toBe('audio/mp4');
    });

    it('should return audio/mp4 when it is supported (priority)', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 0
      };
      global.MediaRecorder = {
        isTypeSupported: vi.fn((type) => 
          type === 'audio/mp4' || type === 'audio/webm'
        )
      };

      const mimeType = AudioRecorder.getSupportedMimeType();
      expect(mimeType).toBe('audio/mp4');
    });

    it('should fallback to webm when mp4 not supported', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 0
      };
      global.MediaRecorder = {
        isTypeSupported: vi.fn((type) => 
          type === 'audio/webm;codecs=opus' || type === 'audio/webm'
        )
      };

      const mimeType = AudioRecorder.getSupportedMimeType();
      expect(mimeType).toBe('audio/webm;codecs=opus');
    });

    it('should return empty string when no formats supported', () => {
      global.navigator = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 0
      };
      global.MediaRecorder = {
        isTypeSupported: vi.fn(() => false)
      };

      const mimeType = AudioRecorder.getSupportedMimeType();
      expect(mimeType).toBe('');
    });
  });

  describe('formatDuration()', () => {
    it('should format 0 milliseconds as 0:00', () => {
      expect(AudioRecorder.formatDuration(0)).toBe('0:00');
    });

    it('should format null/undefined as 0:00', () => {
      expect(AudioRecorder.formatDuration(null)).toBe('0:00');
      expect(AudioRecorder.formatDuration(undefined)).toBe('0:00');
    });

    it('should format negative values as 0:00', () => {
      expect(AudioRecorder.formatDuration(-1000)).toBe('0:00');
    });

    it('should format 30 seconds correctly', () => {
      expect(AudioRecorder.formatDuration(30000)).toBe('0:30');
    });

    it('should format 1 minute correctly', () => {
      expect(AudioRecorder.formatDuration(60000)).toBe('1:00');
    });

    it('should format 1 minute 30 seconds correctly', () => {
      expect(AudioRecorder.formatDuration(90000)).toBe('1:30');
    });

    it('should format 5 minutes 5 seconds correctly', () => {
      expect(AudioRecorder.formatDuration(305000)).toBe('5:05');
    });

    it('should format 10 minutes correctly', () => {
      expect(AudioRecorder.formatDuration(600000)).toBe('10:00');
    });

    it('should pad single digit seconds with zero', () => {
      expect(AudioRecorder.formatDuration(65000)).toBe('1:05');
      expect(AudioRecorder.formatDuration(61000)).toBe('1:01');
    });
  });

  describe('blobToBase64()', () => {
    it('should convert blob to base64 ArrayBuffer', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const blob = new Blob([testData], { type: 'audio/webm' });
      
      const result = await AudioRecorder.blobToBase64(blob);
      
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(5);
    });

    it('should handle empty blob', async () => {
      const blob = new Blob([], { type: 'audio/webm' });
      
      const result = await AudioRecorder.blobToBase64(blob);
      
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBe(0);
    });
  });

  describe('base64ToBlob()', () => {
    it('should convert base64 string to blob with default mime type', () => {
      // "SGVsbG8=" is "Hello" in base64
      const base64 = 'SGVsbG8=';
      
      const blob = AudioRecorder.base64ToBlob(base64);
      
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/webm');
      expect(blob.size).toBe(5);
    });

    it('should convert base64 string to blob with custom mime type', () => {
      const base64 = 'SGVsbG8=';
      
      const blob = AudioRecorder.base64ToBlob(base64, 'audio/mp4');
      
      expect(blob.type).toBe('audio/mp4');
    });

    it('should handle data URL format', () => {
      const dataUrl = 'data:audio/webm;base64,SGVsbG8=';
      
      const blob = AudioRecorder.base64ToBlob(dataUrl);
      
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBe(5);
    });
  });

  describe('AudioRecorder instance', () => {
    let recorder;

    beforeEach(() => {
      recorder = new AudioRecorder();
    });

    it('should initialize with correct default state', () => {
      expect(recorder.mediaRecorder).toBeNull();
      expect(recorder.audioChunks).toEqual([]);
      expect(recorder.audioStream).toBeNull();
      expect(recorder.isRecording).toBe(false);
      expect(recorder.recordingStartTime).toBeNull();
      expect(recorder.mimeType).toBeNull();
    });

    describe('startRecording()', () => {
      it('should not start if already recording', async () => {
        recorder.isRecording = true;
        
        await recorder.startRecording();
        
        expect(recorder.mediaRecorder).toBeNull();
      });

      it('should request microphone access and create MediaRecorder', async () => {
        const mockStream = {
          getTracks: () => [{ stop: vi.fn() }]
        };
        
        const mockMediaRecorder = {
          start: vi.fn(),
          stop: vi.fn(),
          ondataavailable: null,
          onstop: null,
          mimeType: 'audio/webm'
        };

        global.navigator = {
          mediaDevices: {
            getUserMedia: vi.fn().mockResolvedValue(mockStream)
          },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
          platform: 'Win32',
          maxTouchPoints: 0
        };

        global.MediaRecorder = vi.fn(() => mockMediaRecorder);
        global.MediaRecorder.isTypeSupported = vi.fn(() => true);

        await recorder.startRecording();

        expect(global.navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        expect(recorder.isRecording).toBe(true);
        expect(recorder.audioStream).toBe(mockStream);
        expect(mockMediaRecorder.start).toHaveBeenCalledWith(100);
      });

      it('should throw error on microphone access failure', async () => {
        global.navigator = {
          mediaDevices: {
            getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied'))
          },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
          platform: 'Win32',
          maxTouchPoints: 0
        };

        await expect(recorder.startRecording()).rejects.toThrow('Recording failed: Permission denied');
        expect(recorder.isRecording).toBe(false);
      });
    });

    describe('stopRecording()', () => {
      it('should return null if not recording', async () => {
        recorder.isRecording = false;
        
        const result = await recorder.stopRecording();
        
        expect(result).toBeNull();
      });

      it('should stop recording and return blob with duration and mimeType', async () => {
        // Setup mock recording state
        const mockTrack = { stop: vi.fn() };
        recorder.isRecording = true;
        recorder.recordingStartTime = Date.now() - 5000; // 5 seconds ago
        recorder.audioStream = { getTracks: () => [mockTrack] };
        recorder.audioChunks = [
          new Blob(['chunk1'], { type: 'audio/webm' }),
          new Blob(['chunk2'], { type: 'audio/webm' })
        ];
        recorder.mimeType = 'audio/webm';
        
        const mockMediaRecorder = {
          stop: vi.fn(),
          onstop: null,
          mimeType: 'audio/webm'
        };
        recorder.mediaRecorder = mockMediaRecorder;

        // Start stop and trigger onstop callback
        const stopPromise = recorder.stopRecording();
        
        // Simulate async stop
        setTimeout(() => {
          mockMediaRecorder.onstop();
        }, 10);

        const result = await stopPromise;

        expect(result).toBeDefined();
        expect(result.blob).toBeInstanceOf(Blob);
        expect(result.duration).toBeGreaterThanOrEqual(5000);
        expect(result.mimeType).toBe('audio/webm');
        expect(mockTrack.stop).toHaveBeenCalled();
        expect(recorder.isRecording).toBe(false);
        expect(recorder.audioChunks).toEqual([]);
        expect(recorder.mediaRecorder).toBeNull();
      });
    });

    describe('cancelRecording()', () => {
      it('should stop recording without returning data', () => {
        const mockTrack = { stop: vi.fn() };
        recorder.isRecording = true;
        recorder.audioStream = { getTracks: () => [mockTrack] };
        recorder.audioChunks = [new Blob(['data'])];
        recorder.mimeType = 'audio/webm';
        
        const mockMediaRecorder = {
          stop: vi.fn(),
          onstop: null
        };
        recorder.mediaRecorder = mockMediaRecorder;

        recorder.cancelRecording();

        expect(mockMediaRecorder.stop).toHaveBeenCalled();
        expect(mockTrack.stop).toHaveBeenCalled();
        expect(recorder.isRecording).toBe(false);
        expect(recorder.audioChunks).toEqual([]);
        expect(recorder.mimeType).toBeNull();
      });

      it('should do nothing if not recording', () => {
        recorder.isRecording = false;
        recorder.mediaRecorder = null;

        // Should not throw
        recorder.cancelRecording();

        expect(recorder.isRecording).toBe(false);
      });
    });
  });

  describe('playAudio()', () => {
    let mockAudio;

    beforeEach(() => {
      mockAudio = {
        setAttribute: vi.fn(),
        load: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        onended: null,
        onerror: null,
        oncanplaythrough: null,
        src: '',
        preload: '',
        error: null,
        duration: 10
      };

      // Mock Audio constructor
      global.Audio = vi.fn(() => mockAudio);
    });

    it('should create audio element with iOS-compatible attributes', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/mp4' });
      
      const playPromise = AudioRecorder.playAudio(blob);
      
      // Trigger ended event
      mockAudio.onended();
      
      await playPromise;

      expect(mockAudio.setAttribute).toHaveBeenCalledWith('playsinline', 'true');
      expect(mockAudio.setAttribute).toHaveBeenCalledWith('webkit-playsinline', 'true');
      expect(mockAudio.preload).toBe('auto');
      expect(mockAudio.load).toHaveBeenCalled();
      expect(mockAudio.play).toHaveBeenCalled();
    });

    it('should resolve when audio ends', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/webm' });
      
      const playPromise = AudioRecorder.playAudio(blob);
      
      // Trigger ended event
      mockAudio.onended();
      
      await expect(playPromise).resolves.toBeUndefined();
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should reject on audio error', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/webm' });
      
      mockAudio.error = { code: 4, message: 'Format not supported' };
      
      const playPromise = AudioRecorder.playAudio(blob);
      
      // Trigger error event
      mockAudio.onerror({ target: mockAudio });
      
      await expect(playPromise).rejects.toThrow('Playback failed');
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('should reject when play() promise fails', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/webm' });
      
      mockAudio.play = vi.fn().mockRejectedValue(new Error('Autoplay blocked'));
      
      const playPromise = AudioRecorder.playAudio(blob);
      
      await expect(playPromise).rejects.toThrow('Autoplay blocked');
    });

    it('should set correct source from blob URL', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/mp4' });
      
      const playPromise = AudioRecorder.playAudio(blob);
      mockAudio.onended();
      await playPromise;

      expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(mockAudio.src).toBe('blob:mock-url');
    });
  });
});

describe('iOS Audio Recording Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use mp4 format for iOS recordings', () => {
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5
    };
    global.MediaRecorder = {
      isTypeSupported: vi.fn((type) => type === 'audio/mp4')
    };

    expect(AudioRecorder.isIOS()).toBe(true);
    expect(AudioRecorder.getSupportedMimeType()).toBe('audio/mp4');
  });

  it('should use webm format for Android recordings', () => {
    global.navigator = {
      userAgent: 'Mozilla/5.0 (Linux; Android 12)',
      platform: 'Linux armv8l',
      maxTouchPoints: 5
    };
    global.MediaRecorder = {
      isTypeSupported: vi.fn((type) => 
        type === 'audio/webm;codecs=opus' || type === 'audio/webm'
      )
    };

    expect(AudioRecorder.isIOS()).toBe(false);
    // mp4 is first in priority, but if not supported, falls back
    global.MediaRecorder.isTypeSupported = vi.fn((type) => 
      type !== 'audio/mp4' && type !== 'audio/aac' && (
        type === 'audio/webm;codecs=opus' || type === 'audio/webm'
      )
    );
    expect(AudioRecorder.getSupportedMimeType()).toBe('audio/webm;codecs=opus');
  });

  it('should fallback gracefully when no formats are explicitly supported', () => {
    global.navigator = {
      userAgent: 'Mozilla/5.0 (Unknown Device)',
      platform: 'Unknown',
      maxTouchPoints: 0
    };
    global.MediaRecorder = {
      isTypeSupported: vi.fn(() => false)
    };

    // Should return empty string to use browser default
    expect(AudioRecorder.getSupportedMimeType()).toBe('');
  });
});

describe('Recording MIME Type Persistence', () => {
  it('should include mimeType in stopRecording result', async () => {
    const recorder = new AudioRecorder();
    
    // Setup mock state
    const mockTrack = { stop: vi.fn() };
    recorder.isRecording = true;
    recorder.recordingStartTime = Date.now() - 1000;
    recorder.audioStream = { getTracks: () => [mockTrack] };
    recorder.audioChunks = [new Blob(['test'], { type: 'audio/mp4' })];
    recorder.mimeType = 'audio/mp4';
    
    const mockMediaRecorder = {
      stop: vi.fn(),
      onstop: null,
      mimeType: 'audio/mp4'
    };
    recorder.mediaRecorder = mockMediaRecorder;

    const stopPromise = recorder.stopRecording();
    setTimeout(() => mockMediaRecorder.onstop(), 10);
    
    const result = await stopPromise;

    expect(result.mimeType).toBe('audio/mp4');
    expect(result.blob.type).toBe('audio/mp4');
  });

  it('should preserve mimeType for iOS recordings', async () => {
    global.navigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)',
      platform: 'iPhone',
      maxTouchPoints: 5
    };
    global.MediaRecorder = {
      isTypeSupported: vi.fn((type) => type === 'audio/mp4')
    };

    const recorder = new AudioRecorder();
    
    // Simulate iOS recording
    const mockTrack = { stop: vi.fn() };
    recorder.isRecording = true;
    recorder.recordingStartTime = Date.now() - 2000;
    recorder.audioStream = { getTracks: () => [mockTrack] };
    recorder.audioChunks = [new Blob(['ios-audio'], { type: 'audio/mp4' })];
    recorder.mimeType = 'audio/mp4';
    
    const mockMediaRecorder = {
      stop: vi.fn(),
      onstop: null,
      mimeType: 'audio/mp4'
    };
    recorder.mediaRecorder = mockMediaRecorder;

    const stopPromise = recorder.stopRecording();
    setTimeout(() => mockMediaRecorder.onstop(), 10);
    
    const result = await stopPromise;

    // Verify iOS-compatible format is preserved
    expect(result.mimeType).toBe('audio/mp4');
  });
});
