import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AudioRecorder, toRecording } from '@/core/audio/recorder'

function setNavigator(over: Partial<Navigator>) {
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0',
    platform: 'Win32',
    maxTouchPoints: 0,
    mediaDevices: { getUserMedia: vi.fn() },
    ...over,
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('AudioRecorder MIME selection', () => {
  beforeEach(() => {
    class FakeMR {
      static isTypeSupported = vi.fn((t: string) => t === 'audio/webm;codecs=opus' || t === 'audio/mp4')
    }
    vi.stubGlobal('MediaRecorder', FakeMR)
  })

  it('prefers opus WebM on a non-iOS platform', () => {
    setNavigator({})
    expect(AudioRecorder.getSupportedMimeType()).toBe('audio/webm;codecs=opus')
  })

  it('prefers mp4 on iOS (WebM unsupported there)', () => {
    setNavigator({ userAgent: 'iPhone', platform: 'iPhone' })
    expect(AudioRecorder.getSupportedMimeType()).toBe('audio/mp4')
  })

  it('detects iPadOS masquerading as MacIntel via touch points', () => {
    setNavigator({ platform: 'MacIntel', maxTouchPoints: 5 })
    expect(AudioRecorder.isIOS()).toBe(true)
  })

  it('isSupported reflects mediaDevices + MediaRecorder presence', () => {
    setNavigator({})
    expect(AudioRecorder.isSupported()).toBe(true)
  })
})

describe('toRecording', () => {
  it('builds a persistable record from a result + page', () => {
    const blob = new Blob(['x'], { type: 'audio/webm' })
    const now = new Date('2026-07-18T10:00:00.000Z')
    const rec = toRecording({ blob, mimeType: 'audio/webm', duration: 4200 }, 42, now)
    expect(rec).toMatchObject({ pageNumber: 42, mimeType: 'audio/webm', duration: 4200, recordedAt: now.toISOString() })
    expect(rec.blob).toBe(blob)
    expect(rec.id).toMatch(/^\d+-[a-z0-9]+$/)
  })
})
