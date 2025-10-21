/**
 * Audio Store - Manage audio recordings and playback
 */

import { reactive, computed } from 'vue';

export const audioStore = reactive({
    recordings: [], // Array of { id, pageNumber, duration, recordedAt, name }
    isRecording: false,
    currentPlayingId: null,
    showCountdown: false,
    countdownValue: 0,
    mediaRecorder: null,
    audioChunks: [],
    lastUpdated: null
});

/**
 * Save audio recording
 */
export const saveAudio = async (pageNum, audioBlob, duration, murajahDB) => {
    try {
        const id = `audio-${pageNum}-${Date.now()}`;
        const name = `Page ${pageNum} - ${new Date().toLocaleDateString()}`;
        
        const recording = {
            id,
            pageNumber: pageNum,
            audioBlob,
            duration,
            recordedAt: new Date().toISOString(),
            name
        };

        await murajahDB.saveAudio(pageNum, audioBlob, duration);
        
        // Check if we already have recording for this page, if so update
        const existingIndex = audioStore.recordings.findIndex(
            r => r.pageNumber === pageNum
        );
        
        if (existingIndex >= 0) {
            audioStore.recordings[existingIndex] = recording;
        } else {
            audioStore.recordings.push(recording);
        }
        
        audioStore.lastUpdated = new Date();
        console.log(`[Murajah] Saved audio for page ${pageNum}`);
        
        return id;
    } catch (error) {
        console.error('[Murajah] Error saving audio:', error);
        throw error;
    }
};

/**
 * Delete audio recording
 */
export const deleteAudio = async (id, murajahDB) => {
    try {
        await murajahDB.deleteAudio(id);
        
        const index = audioStore.recordings.findIndex(r => r.id === id);
        if (index >= 0) {
            const pageNum = audioStore.recordings[index].pageNumber;
            audioStore.recordings.splice(index, 1);
            audioStore.lastUpdated = new Date();
            console.log(`[Murajah] Deleted audio for page ${pageNum}`);
        }
    } catch (error) {
        console.error('[Murajah] Error deleting audio:', error);
        throw error;
    }
};

/**
 * Get audio for a specific page
 */
export const getPageAudio = (pageNum) => {
    return audioStore.recordings.find(r => r.pageNumber === pageNum);
};

/**
 * Load all audio recordings from IndexedDB
 */
export const loadAudioRecordings = async (murajahDB) => {
    try {
        const recordings = await murajahDB.getAllAudio();
        
        // Convert to plain objects and sort by page
        audioStore.recordings = recordings
            .sort((a, b) => a.pageNumber - b.pageNumber);
        
        audioStore.lastUpdated = new Date();
        console.log(`[Murajah] Loaded ${recordings.length} audio recordings`);
    } catch (error) {
        console.error('[Murajah] Error loading audio:', error);
        throw error;
    }
};

/**
 * Start countdown before recording
 */
export const startCountdown = (seconds = 3) => {
    return new Promise((resolve) => {
        audioStore.showCountdown = true;
        audioStore.countdownValue = seconds;
        
        const interval = setInterval(() => {
            audioStore.countdownValue--;
            
            if (audioStore.countdownValue <= 0) {
                clearInterval(interval);
                audioStore.showCountdown = false;
                resolve();
            }
        }, 1000);
    });
};

/**
 * Start recording audio
 */
export const startRecording = async () => {
    try {
        // First show countdown
        await startCountdown(3);
        
        audioStore.isRecording = true;
        audioStore.audioChunks = [];
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
            audioStore.audioChunks.push(event.data);
        };
        
        mediaRecorder.onstart = () => {
            console.log('[Murajah] Recording started');
        };
        
        mediaRecorder.start();
        audioStore.mediaRecorder = mediaRecorder;
        
    } catch (error) {
        console.error('[Murajah] Error starting recording:', error);
        audioStore.isRecording = false;
        throw error;
    }
};

/**
 * Stop recording and return blob
 */
export const stopRecording = async () => {
    return new Promise((resolve, reject) => {
        if (!audioStore.mediaRecorder) {
            reject(new Error('No active recording'));
            return;
        }

        audioStore.mediaRecorder.onstop = () => {
            const blob = new Blob(audioStore.audioChunks, { type: 'audio/wav' });
            audioStore.isRecording = false;
            audioStore.mediaRecorder = null;
            audioStore.audioChunks = [];
            
            console.log('[Murajah] Recording stopped, blob size:', blob.size);
            resolve(blob);
        };

        audioStore.mediaRecorder.stop();
        
        // Stop all tracks
        const stream = audioStore.mediaRecorder.stream;
        stream.getTracks().forEach(track => track.stop());
    });
};

/**
 * Play audio recording
 */
export const playAudio = (recording) => {
    try {
        if (!recording || !recording.audioBlob) {
            throw new Error('No audio blob found');
        }

        const url = URL.createObjectURL(recording.audioBlob);
        const audio = new Audio(url);
        
        audioStore.currentPlayingId = recording.id;
        
        audio.onended = () => {
            audioStore.currentPlayingId = null;
            URL.revokeObjectURL(url);
        };
        
        audio.play().catch(error => {
            console.error('[Murajah] Error playing audio:', error);
            audioStore.currentPlayingId = null;
        });
        
    } catch (error) {
        console.error('[Murajah] Error in playAudio:', error);
        throw error;
    }
};

/**
 * Clear all recordings
 */
export const clearAllRecordings = async (murajahDB) => {
    try {
        const count = audioStore.recordings.length;
        
        for (const recording of audioStore.recordings) {
            await murajahDB.deleteAudio(recording.id);
        }
        
        audioStore.recordings = [];
        audioStore.lastUpdated = new Date();
        console.log(`[Murajah] Cleared ${count} audio recordings`);
    } catch (error) {
        console.error('[Murajah] Error clearing recordings:', error);
        throw error;
    }
};

// Computed properties
export const recordingsCount = computed(() => 
    audioStore.recordings.length
);

export const recordedPages = computed(() => 
    audioStore.recordings.map(r => r.pageNumber)
);

export const sortedRecordings = computed(() => 
    [...audioStore.recordings].sort((a, b) => a.pageNumber - b.pageNumber)
);

export const totalDuration = computed(() => {
    let total = 0;
    for (const recording of audioStore.recordings) {
        total += recording.duration || 0;
    }
    return Math.round(total);
});
