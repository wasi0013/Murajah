/**
 * Microphone recorder (7.6.1) — a thin, typed wrapper over MediaRecorder.
 *
 * Ported from the legacy `audioRecorder.js`, keeping the two behaviours that were
 * *correct* there (bug catalogue A8): iOS needs `audio/mp4`/`aac` (no WebM), and the
 * measured wall-clock duration is stored because WebM blobs report `Infinity` from
 * the media element. Everything stateful about the stream lives here; the store just
 * holds the finished recordings.
 */

export interface RecordingResult {
  blob: Blob
  mimeType: string
  /** Recorded length in milliseconds (wall-clock; media metadata is unreliable). */
  duration: number
}

/** A saved recording (what the store/DB persists). */
export interface Recording {
  id: string
  /** The page being recited when this was recorded. */
  pageNumber: number
  blob: Blob
  mimeType: string
  duration: number
  /** ISO timestamp. */
  recordedAt: string
}

const IOS_MIME_TYPES = ['audio/mp4', 'audio/aac', 'audio/wav', '']
const OTHER_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/wav', '']

export class AudioRecorder {
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private mimeType = ''

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    )
  }

  static isIOS(): boolean {
    if (typeof navigator === 'undefined') return false
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
  }

  /** The best MIME type the platform supports (`''` = let the browser choose). */
  static getSupportedMimeType(): string {
    const candidates = AudioRecorder.isIOS() ? IOS_MIME_TYPES : OTHER_MIME_TYPES
    for (const type of candidates) {
      if (type === '' || MediaRecorder.isTypeSupported(type)) return type
    }
    return ''
  }

  get isRecording(): boolean {
    return this.recorder?.state === 'recording'
  }

  /** Request the mic and begin recording. Rejects if permission is denied. */
  async start(): Promise<void> {
    if (this.isRecording) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
    this.mimeType = AudioRecorder.getSupportedMimeType()
    this.chunks = []
    this.recorder = this.mimeType
      ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.stream)
    this.recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    })
    this.startedAt = Date.now()
    this.recorder.start()
  }

  /** Stop recording and resolve with the assembled blob + measured duration. */
  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const rec = this.recorder
      if (!rec) {
        reject(new Error('Not recording'))
        return
      }
      rec.addEventListener(
        'stop',
        () => {
          const type = this.mimeType || rec.mimeType || 'audio/webm'
          const blob = new Blob(this.chunks, { type })
          const duration = Date.now() - this.startedAt
          this.release()
          resolve({ blob, mimeType: type, duration })
        },
        { once: true },
      )
      rec.stop()
    })
  }

  /** Abort without producing a recording, freeing the mic. */
  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    this.release()
    this.chunks = []
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.recorder = null
  }
}

/** Create a Recording record from a result + the page it belongs to. */
export function toRecording(result: RecordingResult, pageNumber: number, now = new Date()): Recording {
  return {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    pageNumber,
    blob: result.blob,
    mimeType: result.mimeType,
    duration: result.duration,
    recordedAt: now.toISOString(),
  }
}
