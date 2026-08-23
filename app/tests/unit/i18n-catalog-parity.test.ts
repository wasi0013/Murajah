import { describe, it, expect } from 'vitest'
import en from '@/core/i18n/catalogs/en'
import ar from '@/core/i18n/catalogs/ar'
import bn from '@/core/i18n/catalogs/bn'
import type { Messages } from '@/core/i18n/types'

// en.ts is documented as "the source of truth for keys" (its own header
// comment: "add it here first, then mirror the key into ar.ts / bn.ts") — but
// nothing previously checked that the mirroring actually happened. Phase
// 12.7.1 is the first phase to add journal.* keys across all three catalogs,
// so this closes that gap rather than silently joining it.

function flatten(messages: Messages, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') keys.add(path)
    else for (const k of flatten(value, path)) keys.add(k)
  }
  return keys
}

describe('i18n catalog key parity', () => {
  const enKeys = flatten(en)

  it('ar.ts has every key en.ts has (no missing translations)', () => {
    const arKeys = flatten(ar)
    const missing = [...enKeys].filter((k) => !arKeys.has(k))
    expect(missing).toEqual([])
  })

  it('bn.ts has every key en.ts has (no missing translations)', () => {
    const bnKeys = flatten(bn)
    const missing = [...enKeys].filter((k) => !bnKeys.has(k))
    expect(missing).toEqual([])
  })

  it('ar.ts has no orphaned keys en.ts no longer defines', () => {
    const arKeys = flatten(ar)
    const orphaned = [...arKeys].filter((k) => !enKeys.has(k))
    expect(orphaned).toEqual([])
  })

  it('bn.ts has no orphaned keys en.ts no longer defines', () => {
    const bnKeys = flatten(bn)
    const orphaned = [...bnKeys].filter((k) => !enKeys.has(k))
    expect(orphaned).toEqual([])
  })

  it('every journal.* key specifically is present in all three catalogs', () => {
    const journalKeys = [...enKeys].filter((k) => k.startsWith('journal.'))
    expect(journalKeys.length).toBeGreaterThan(10) // sanity: the block actually landed
    const arKeys = flatten(ar)
    const bnKeys = flatten(bn)
    for (const k of journalKeys) {
      expect(arKeys.has(k), `ar missing ${k}`).toBe(true)
      expect(bnKeys.has(k), `bn missing ${k}`).toBe(true)
    }
  })
})
