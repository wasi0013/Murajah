import { describe, it, expect } from 'vitest'
import { shuffle, pickRandom, sampleWithout } from '@/core/quiz/select'
import type { Rng } from '@/core/quiz/types'

/** A deterministic RNG cycling through the given values in [0,1). */
function seqRng(values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length]
}

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5]
    const out = shuffle(input, seqRng([0.1, 0.9, 0.3, 0.7, 0.5]))
    expect([...out].sort((a, b) => a - b)).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5]) // untouched
    expect(out).not.toBe(input) // new array
  })

  it('is deterministic under a seeded rng', () => {
    const rng1 = seqRng([0.42, 0.11, 0.77, 0.3])
    const rng2 = seqRng([0.42, 0.11, 0.77, 0.3])
    expect(shuffle([1, 2, 3, 4], rng1)).toEqual(shuffle([1, 2, 3, 4], rng2))
  })

  it('handles empty and singleton arrays', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle([7])).toEqual([7])
  })
})

describe('pickRandom', () => {
  it('returns undefined for an empty array', () => {
    expect(pickRandom([])).toBeUndefined()
  })

  it('indexes by the rng', () => {
    expect(pickRandom(['a', 'b', 'c', 'd'], () => 0.5)).toBe('c') // floor(0.5*4)=2
  })
})

describe('sampleWithout', () => {
  it('excludes items and never duplicates', () => {
    const pool = [1, 2, 3, 4, 5]
    const out = sampleWithout(pool, new Set([2, 4]), 3, undefined, seqRng([0, 0, 0]))
    expect(out).toHaveLength(3)
    expect(out).not.toContain(2)
    expect(out).not.toContain(4)
    expect(new Set(out).size).toBe(out.length)
  })

  it('returns min(count, eligible) when the pool is small', () => {
    const out = sampleWithout([1, 2, 3], new Set([1]), 10)
    expect(out).toHaveLength(2) // only 2 and 3 are eligible
  })

  it('excludes by a derived key', () => {
    const pool = [
      { id: 'a', text: 'و' },
      { id: 'b', text: 'في' },
      { id: 'c', text: 'من' },
    ]
    const out = sampleWithout(pool, new Set(['و']), 5, (w) => w.text)
    expect(out.map((w) => w.text)).not.toContain('و')
    expect(out).toHaveLength(2)
  })
})
