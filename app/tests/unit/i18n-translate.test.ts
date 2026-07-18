import { describe, it, expect } from 'vitest'
import { resolveMessage, interpolate } from '@/core/i18n/translate'
import type { Messages } from '@/core/i18n/types'

const messages: Messages = {
  settings: {
    title: 'Settings',
    data: { restored: 'Restored {count} items' },
  },
}

describe('resolveMessage', () => {
  it('resolves a nested dotted key to its leaf string', () => {
    expect(resolveMessage(messages, 'settings.title')).toBe('Settings')
    expect(resolveMessage(messages, 'settings.data.restored')).toBe('Restored {count} items')
  })

  it('returns undefined for a missing segment', () => {
    expect(resolveMessage(messages, 'settings.missing')).toBeUndefined()
    expect(resolveMessage(messages, 'nope.nope')).toBeUndefined()
  })

  it('returns undefined when the key lands on a subtree, not a string', () => {
    expect(resolveMessage(messages, 'settings.data')).toBeUndefined()
  })
})

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('Restored {count} items', { count: 3 })).toBe('Restored 3 items')
  })

  it('leaves unknown placeholders verbatim so gaps are visible', () => {
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}')
  })

  it('coerces numeric params to strings', () => {
    expect(interpolate('{a}+{b}', { a: 1, b: 2 })).toBe('1+2')
  })
})
