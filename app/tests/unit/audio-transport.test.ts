import { describe, it, expect } from 'vitest'
import { nextOnEnd, nextOnFailure } from '@/core/audio/transport'

describe('nextOnEnd', () => {
  it('advances to the next item when autoplay-next is on', () => {
    expect(nextOnEnd(0, 3, true, false)).toEqual({ index: 1 })
  })

  it('stops at the end of an item when autoplay-next is off', () => {
    expect(nextOnEnd(0, 3, false, false)).toBe('stop')
  })

  it('stops after the last item without loop', () => {
    expect(nextOnEnd(2, 3, true, false)).toBe('stop')
  })

  it('wraps to the start after the last item when loop-playlist is on', () => {
    expect(nextOnEnd(2, 3, true, true)).toEqual({ index: 0 })
    // loop wins even with autoplay-next off — the user asked the whole list to repeat.
    expect(nextOnEnd(2, 3, false, true)).toEqual({ index: 0 })
  })

  it('stops on an empty list', () => {
    expect(nextOnEnd(-1, 0, true, true)).toBe('stop')
  })
})

describe('nextOnFailure', () => {
  it('skips forward even with autoplay concerns (the item is unplayable)', () => {
    expect(nextOnFailure(0, 3)).toEqual({ index: 1 })
  })
  it('stops at the end of the list', () => {
    expect(nextOnFailure(2, 3)).toBe('stop')
  })
})
