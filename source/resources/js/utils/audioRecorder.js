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

      this.mediaRecorder = new MediaRecorder(this.audioStream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      this.mediaRecorder.start();
      this.recordingStartTime = Date.now();
      this.isRecording = true;
      
      Logger.debug(Logger.MODULES.AUDIO, 'Recording started');
    } catch (error) {
      Logger.error(Logger.MODULES.AUDIO, 'Failed to start recording', error);
      throw new Error(`Recording failed: ${error.message}`);
    }
  }

  /**
   * Stop recording and return audio blob
   * @returns {Promise<{blob: Blob, duration: number}>}
   */
  async stopRecording() {
    if (!this.isRecording) {
      Logger.warn(Logger.MODULES.AUDIO, 'Attempt to stop recording when not recording');
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        const duration = Date.now() - (this.recordingStartTime || Date.now());
        
        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

          // Stop all audio tracks
          this.audioStream?.getTracks().forEach(track => track.stop());

          this.isRecording = false;
          this.audioChunks = [];
          this.mediaRecorder = null;
          this.audioStream = null;
          this.recordingStartTime = null;

          Logger.info(Logger.MODULES.AUDIO, 'Recording stopped', {
            duration: `${duration}ms`,
            size: `${(audioBlob.size / 1024).toFixed(2)}KB`
          });
          
          resolve({ blob: audioBlob, duration });
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
      Logger.info(Logger.MODULES.AUDIO, 'Recording cancelled by user');
    }
  }

  static playAudio(audioBlob) {
    return new Promise((resolve, reject) => {
      try {
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          Logger.debug(Logger.MODULES.AUDIO, 'Audio playback finished');
          resolve();
        };

        audio.onerror = (error) => {
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        Logger.debug(Logger.MODULES.AUDIO, 'Audio playback started');
        audio.play().catch(reject);
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
