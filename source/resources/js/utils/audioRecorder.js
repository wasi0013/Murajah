/**
 * Murajah Audio Recording Utility
 * Handles audio recording, playback, and blob management
 */

export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.audioStream = null;
    this.isRecording = false;
    this.recordingStartTime = null; // Track when recording actually started
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
      console.warn('[Murajah] Already recording');
      return;
    }

    try {
      console.log('[Murajah] Requesting microphone access...');
      
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
      this.recordingStartTime = Date.now(); // Capture start time when recording actually begins
      this.isRecording = true;
      const capturedTime = this.recordingStartTime; // Double-check it was captured
      console.log('[Murajah] Recording started. recordingStartTime:', this.recordingStartTime, 'verified:', capturedTime, 'type:', typeof this.recordingStartTime);
    } catch (error) {
      console.error('[Murajah] Failed to start recording:', error);
      throw new Error(`Recording failed: ${error.message}`);
    }
  }

  /**
   * Stop recording and return audio blob
   * @returns {Promise<{blob: Blob, duration: number}>}
   */
  async stopRecording() {
    if (!this.isRecording) {
      console.warn('[Murajah] No recording in progress');
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        if (!this.recordingStartTime) {
          console.error('[Murajah] ERROR: recordingStartTime is not set!', {
            isRecording: this.isRecording,
            recordingStartTime: this.recordingStartTime,
            mediaRecorder: !!this.mediaRecorder
          });
        }

        // Calculate duration from when recording actually started
        const duration = Date.now() - (this.recordingStartTime || Date.now());
        console.log('[Murajah] stopRecording - recordingStartTime:', this.recordingStartTime);
        console.log('[Murajah] stopRecording - current time:', Date.now());
        console.log('[Murajah] stopRecording - calculated duration (ms):', duration);

        this.mediaRecorder.onstop = () => {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

          // Stop all audio tracks
          this.audioStream?.getTracks().forEach(track => track.stop());

          this.isRecording = false;
          this.audioChunks = [];
          this.mediaRecorder = null;
          this.audioStream = null;
          this.recordingStartTime = null;

          console.log('[Murajah] Recording stopped. Duration:', duration, 'ms');
          console.log('[Murajah] Returning result:', { blob: audioBlob, duration: duration });
          resolve({ blob: audioBlob, duration });
        };

        this.mediaRecorder.stop();
      } catch (error) {
        console.error('[Murajah] Failed to stop recording:', error);
        reject(error);
      }
    });
  }

  /**
   * Cancel recording without saving
   */
  cancelRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.audioStream?.getTracks().forEach(track => track.stop());
      this.isRecording = false;
      this.audioChunks = [];
      this.recordingStartTime = null;
      console.log('[Murajah] Recording cancelled');
    }
  }

  /**
   * Play audio blob
   * @param {Blob} audioBlob - Audio blob to play
   * @returns {Promise<void>}
   */
  static playAudio(audioBlob) {
    return new Promise((resolve, reject) => {
      try {
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = (error) => {
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        audio.play().catch(reject);
      } catch (error) {
        console.error('[Murajah] Failed to play audio:', error);
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
