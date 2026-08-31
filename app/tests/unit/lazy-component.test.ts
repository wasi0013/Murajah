import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AsyncComponentOptions } from 'vue'
import { useToasts } from '@/composables/useToast'

// Bug: the Reader/Mushaf headphone icon (and RecordingPanel/MorphologyPopup,
// which share the exact same unguarded `defineAsyncComponent(() =>
// import(...))` pattern) did nothing when offline — Vue's async-component
// wrapper has no default user feedback on a load failure, and permanently
// caches the failure for the definition's whole lifetime, so even
// retrying later (once back online) silently did nothing. lazyComponent
// retries once, then surfaces a toast and calls onFail to reset the
// trigger's "open" state.
//
// Tests target `lazyComponent`'s own `onError` decision logic directly
// (captured via a partial `vue` mock) rather than driving it through a real
// mounted async component — Vue's actual retry() re-invokes the loader
// through its own promise-chaining machinery that doesn't interact cleanly
// with vitest's mocks/fake timers in this environment, which is a test-
// harness concern, not something `lazyComponent.ts` itself controls.

let capturedOptions: AsyncComponentOptions | null = null

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    defineAsyncComponent: (opts: AsyncComponentOptions) => {
      capturedOptions = opts
      return actual.defineComponent({ render: () => null })
    },
  }
})

const { lazyComponent } = await import('@/composables/lazyComponent')

beforeEach(() => {
  useToasts().splice(0)
  vi.useFakeTimers()
  capturedOptions = null
})

describe('lazyComponent', () => {
  it('passes the loader straight through to defineAsyncComponent', () => {
    const loader = vi.fn(async () => ({ default: {} }))
    lazyComponent(loader)
    expect(capturedOptions?.loader).toBe(loader)
  })

  it('retries once (attempts < 2) without showing a toast or calling onFail yet', () => {
    const onFail = vi.fn()
    lazyComponent(vi.fn(), onFail)
    const retry = vi.fn()
    const fail = vi.fn()

    capturedOptions!.onError!(new TypeError('Failed to fetch'), retry, fail, 1)
    vi.runAllTimers() // drains the retry-delay setTimeout

    expect(retry).toHaveBeenCalledTimes(1)
    expect(fail).not.toHaveBeenCalled()
    expect(onFail).not.toHaveBeenCalled()
    expect(useToasts()).toHaveLength(0)
  })

  it('gives up after MAX_ATTEMPTS: shows a network toast, calls onFail, then fail()', () => {
    const onFail = vi.fn()
    lazyComponent(vi.fn(), onFail)
    const retry = vi.fn()
    const fail = vi.fn()

    capturedOptions!.onError!(new TypeError('Failed to fetch'), retry, fail, 2)

    expect(retry).not.toHaveBeenCalled()
    expect(onFail).toHaveBeenCalledTimes(1)
    expect(fail).toHaveBeenCalledTimes(1)
    const last = useToasts().at(-1)
    expect(last?.variant).toBe('error')
    expect(last?.message).toMatch(/internet|wi-?fi/i)
  })

  it('shows the generic load-error message for a non-network failure', () => {
    lazyComponent(vi.fn())
    const fail = vi.fn()

    capturedOptions!.onError!(new TypeError('boom'), vi.fn(), fail, 2)

    expect(fail).toHaveBeenCalledTimes(1)
    const last = useToasts().at(-1)
    expect(last?.variant).toBe('error')
    expect(last?.message).not.toMatch(/internet|wi-?fi/i)
  })

  it('works with no onFail supplied at all (optional)', () => {
    lazyComponent(vi.fn())
    const fail = vi.fn()
    expect(() => capturedOptions!.onError!(new TypeError('boom'), vi.fn(), fail, 2)).not.toThrow()
    expect(fail).toHaveBeenCalledTimes(1)
  })
})
