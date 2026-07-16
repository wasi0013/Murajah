import { describe, it, expect } from 'vitest'
import { imagePath, dimensions, inRange, type MushafManifest } from '@/core/mushaf/manifest'

const uniform: MushafManifest = {
  pageCount: 604,
  pathTemplate: 'img/mushaf/{page}.webp',
  width: 678,
  height: 966,
  version: 'v1',
}

const withOverrides: MushafManifest = {
  ...uniform,
  pages: { '300': { w: 700, h: 980 } },
}

describe('mushaf manifest resolution', () => {
  it('builds per-page image paths from the template', () => {
    expect(imagePath(uniform, 1)).toBe('img/mushaf/1.webp')
    expect(imagePath(uniform, 604)).toBe('img/mushaf/604.webp')
  })

  it('returns the uniform dimensions for any page', () => {
    expect(dimensions(uniform, 1)).toEqual({ w: 678, h: 966 })
    expect(dimensions(uniform, 500)).toEqual({ w: 678, h: 966 })
  })

  it('honours per-page dimension overrides', () => {
    expect(dimensions(withOverrides, 300)).toEqual({ w: 700, h: 980 })
    expect(dimensions(withOverrides, 301)).toEqual({ w: 678, h: 966 }) // falls back
  })

  it('validates page range', () => {
    expect(inRange(uniform, 1)).toBe(true)
    expect(inRange(uniform, 604)).toBe(true)
    expect(inRange(uniform, 0)).toBe(false)
    expect(inRange(uniform, 605)).toBe(false)
    expect(inRange(uniform, 1.5)).toBe(false)
  })
})
