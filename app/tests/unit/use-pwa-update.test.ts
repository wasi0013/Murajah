import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PwaRegisterHandlers, PwaController } from '@/core/pwa/registerServiceWorker'

const checkForUpdate = vi.fn(() => Promise.resolve())
let capturedHandlers: PwaRegisterHandlers | undefined

vi.mock('@/core/pwa/registerServiceWorker', () => ({
  registerServiceWorker: vi.fn((handlers: PwaRegisterHandlers) => {
    capturedHandlers = handlers
    return Promise.resolve({
      registration: {} as ServiceWorkerRegistration,
      isFirstHandoff: false,
      checkForUpdate,
      applyUpdate: vi.fn(),
    } satisfies PwaController)
  }),
}))

describe('usePwaUpdate', () => {
  beforeEach(() => {
    checkForUpdate.mockClear()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState')
  })

  it('checks for an update on foreground, throttled rather than on every flicker', async () => {
    vi.useFakeTimers()
    const { usePwaUpdate } = await import('@/composables/usePwaUpdate')
    await usePwaUpdate().init()
    expect(capturedHandlers).toBeDefined()

    // A flicker in the same instant as boot must NOT trigger a check — racing
    // a manual update() against the registration's own still-settling initial
    // install produced a spurious duplicate install (a real reload loop) in
    // testing, so the throttle window starts counting from module load.
    document.dispatchEvent(new Event('visibilitychange'))
    expect(checkForUpdate).not.toHaveBeenCalled()

    vi.advanceTimersByTime(61_000)
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    expect(checkForUpdate).toHaveBeenCalledTimes(1) // throttled — rapid flicker collapses to one call

    vi.advanceTimersByTime(61_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(checkForUpdate).toHaveBeenCalledTimes(2) // outside the throttle window — checks again

    vi.useRealTimers()
  })
})
