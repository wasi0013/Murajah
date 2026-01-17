/**
 * Murajah Audio Recording Utility
 * Handles audio recording, playback, and blob management
 */

import Logger from './logger.js';

export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioStream = null;
    this.isRecording = false;
    this.recordingStartTime = null;
    this.mimeType = null;
  }

  /**
   * Check if browser supports audio recording
   */
  static isSupported() {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.MediaRecorder
    );
  }

  /**
   * Detect if running on iOS device
   * @returns {boolean}
   */
  static isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /**
   * Get the best supported MIME type for recording
   * iOS requires mp4/aac, while other browsers prefer webm
   * @returns {string} Supported MIME type
   */
  static getSupportedMimeType() {
    // Priority order for MIME types
    // iOS Safari/Chrome only supports mp4/aac, not webm
    const mimeTypes = [
      'audio/mp4',           // Best for iOS compatibility
      'audio/aac',           // AAC codec
      'audio/webm;codecs=opus', // Best quality for Chrome/Firefox
      'audio/webm',          // Fallback webm
      'audio/ogg;codecs=opus',  // Firefox fallback
      'audio/wav',           // Universal but large
      ''                     // Empty string = browser default
    ];

    // On iOS, prioritize mp4/aac
    if (AudioRecorder.isIOS()) {
      // iOS Safari prefers these formats
      const iosMimeTypes = ['audio/mp4', 'audio/aac', 'audio/wav', ''];
      for (const mimeType of iosMimeTypes) {
        if (mimeType === '' || MediaRecorder.isTypeSupported(mimeType)) {
          Logger.info(Logger.MODULES.AUDIO, `iOS detected, using MIME type: ${mimeType || 'browser default'}`);
          return mimeType;
        }
      }
    }

    // For other browsers, use standard priority
    for (const mimeType of mimeTypes) {
      if (mimeType === '' || MediaRecorder.isTypeSupported(mimeType)) {
        Logger.info(Logger.MODULES.AUDIO, `Using MIME type: ${mimeType || 'browser default'}`);
        return mimeType;
      }
    }

    return '';
  }

  /**
   * Request microphone permission and start recording
   * @returns {Promise<void>}
   */
  async startRecording() {
    if (this.isRecording) {
      Logger.warn(Logger.MODULES.AUDIO, 'Attempt to start recording while already recording');
      return;
    }

    try {
      Logger.info(Logger.MODULES.AUDIO, 'Requesting microphone access');
      
      this.audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Get the best supported MIME type for this device
      this.mimeType = AudioRecorder.getSupportedMimeType();
      
      // Create MediaRecorder with appropriate options
      const recorderOptions = {};
      if (this.mimeType) {
        recorderOptions.mimeType = this.mimeType;
      }
      
      try {
        this.mediaRecorder = new MediaRecorder(this.audioStream, recorderOptions);
      } catch (e) {
        // If the specified mimeType fails, fallback to default
        Logger.warn(Logger.MODULES.AUDIO, `Failed to create MediaRecorder with ${this.mimeType}, using default`, e);
        this.mediaRecorder = new MediaRecorder(this.audioStream);
        this.mimeType = this.mediaRecorder.mimeType || 'audio/webm';
      }
      
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Request data in smaller chunks for better compatibility
      this.mediaRecorder.start(100);
      this.recordingStartTime = Date.now();
      this.isRecording = true;
      
      Logger.debug(Logger.MODULES.AUDIO, 'Recording started', { 
        mimeType: this.mediaRecorder.mimeType,
        isIOS: AudioRecorder.isIOS()
      });
    } catch (error) {
      Logger.error(Logger.MODULES.AUDIO, 'Failed to start recording', error);
      throw new Error(`Recording failed: ${error.message}`);
    }
  }

  /**
   * Stop recording and return audio blob
   * @returns {Promise<{blob: Blob, duration: number, mimeType: string}>}
   */
  async stopRecording() {
    if (!this.isRecording) {
      Logger.warn(Logger.MODULES.AUDIO, 'Attempt to stop recording when not recording');
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        const duration = Date.now() - (this.recordingStartTime || Date.now());
        // Capture the actual MIME type used by the recorder
        const actualMimeType = this.mediaRecorder.mimeType || this.mimeType || 'audio/webm';
        
        this.mediaRecorder.onstop = () => {
          // Use the actual MIME type from the recorder for the blob
          const audioBlob = new Blob(this.audioChunks, { type: actualMimeType });

          // Stop all audio tracks
          this.audioStream?.getTracks().forEach(track => track.stop());

          this.isRecording = false;
          this.audioChunks = [];
          this.mediaRecorder = null;
          this.audioStream = null;
          this.recordingStartTime = null;
          this.mimeType = null;

          Logger.info(Logger.MODULES.AUDIO, 'Recording stopped', {
            duration: `${duration}ms`,
            size: `${(audioBlob.size / 1024).toFixed(2)}KB`,
            mimeType: actualMimeType
          });
          
          resolve({ blob: audioBlob, duration, mimeType: actualMimeType });
        };

        this.mediaRecorder.stop();
      } catch (error) {
        Logger.error(Logger.MODULES.AUDIO, 'Failed to stop recording', error);
        reject(error);
      }
    });
  }

  cancelRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.audioStream?.getTracks().forEach(track => track.stop());
      this.isRecording = false;
      this.audioChunks = [];
      this.recordingStartTime = null;
      this.mimeType = null;
      Logger.info(Logger.MODULES.AUDIO, 'Recording cancelled by user');
    }
  }

  /**
   * Play audio blob with iOS compatibility
   * @param {Blob} audioBlob - The audio blob to play
   * @returns {Promise<void>}
   */
  static playAudio(audioBlob) {
    return new Promise((resolve, reject) => {
      try {
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio();
        
        // iOS requires explicit attributes for audio playback
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.preload = 'auto';
        
        const cleanup = () => {
          URL.revokeObjectURL(audioUrl);
        };

        audio.onended = () => {
          cleanup();
          Logger.debug(Logger.MODULES.AUDIO, 'Audio playback finished');
          resolve();
        };

        audio.onerror = (event) => {
          cleanup();
          const error = audio.error;
          const errorMessage = error ? `${error.code}: ${error.message}` : 'Unknown playback error';
          Logger.error(Logger.MODULES.AUDIO, 'Audio playback error', { 
            errorMessage,
            blobType: audioBlob.type,
            blobSize: audioBlob.size,
            isIOS: AudioRecorder.isIOS()
          });
          reject(new Error(`Playback failed: ${errorMessage}`));
        };

        // For iOS, we need to handle the canplaythrough event
        audio.oncanplaythrough = () => {
          Logger.debug(Logger.MODULES.AUDIO, 'Audio ready to play', {
            duration: audio.duration,
            blobType: audioBlob.type
          });
        };

        // Set the source after event handlers are attached
        audio.src = audioUrl;
        
        // Load the audio explicitly (important for iOS)
        audio.load();

        Logger.debug(Logger.MODULES.AUDIO, 'Attempting audio playback', {
          blobType: audioBlob.type,
          blobSize: audioBlob.size,
          isIOS: AudioRecorder.isIOS()
        });
        
        // Use a small delay for iOS to ensure the audio is loaded
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          playPromise.catch((playError) => {
            cleanup();
            Logger.error(Logger.MODULES.AUDIO, 'Play promise rejected', playError);
            reject(playError);
          });
        }
      } catch (error) {
        Logger.error(Logger.MODULES.AUDIO, 'Failed to play audio', error);
        reject(error);
      }
    });
  }

  /**
   * Convert blob to base64 for storage
   * @param {Blob} blob - Audio blob
   * @returns {Promise<string>} Base64 encoded audio
   */
  static blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * Convert base64 back to blob
   * @param {string} base64 - Base64 encoded audio
   * @param {string} mimeType - MIME type
   * @returns {Blob}
   */
  static base64ToBlob(base64, mimeType = 'audio/webm') {
    const binary = atob(base64.split(',')[1] || base64);
    const array = [];
    for (let i = 0; i < binary.length; i++) {
      array.push(binary.charCodeAt(i));
    }
    return new Blob([new Uint8Array(array)], { type: mimeType });
  }

  /**
   * Format duration in milliseconds to readable string
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted time (MM:SS)
   */
  static formatDuration(ms) {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

export default AudioRecorder;
