import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SOURCE_DATA } from '../src/lib/paths.mjs'
import { unwrapMorphology, wrapMorphology } from '../src/chunk-morphology.mjs'

const SRC = `${SOURCE_DATA}/morphology`
const read = (surah) => JSON.parse(readFileSync(`${SRC}/${surah}.json`, 'utf8'))

// Spot-check a small surah and the largest (surah 2, 6116 words).
for (const surah of [1, 2, 36]) {
  const source = read(surah)

  test(`morphology surah ${surah}: unwrap→wrap is lossless`, () => {
    const flat = unwrapMorphology(source)
    assert.deepStrictEqual(wrapMorphology(flat), source)
  })

  test(`morphology surah ${surah}: every word keyed s:a:w with correct prefix`, () => {
    const flat = unwrapMorphology(source)
    const keys = Object.keys(flat)
    assert.ok(keys.length > 0)
    for (const key of keys) {
      const parts = key.split(':')
      assert.equal(parts.length, 3)
      assert.equal(parts[0], String(surah))
      assert.match(key, /^\d+:\d+:\d+$/)
      assert.equal(typeof flat[key], 'string')
      assert.ok(flat[key].length > 0)
    }
  })
}

test('morphology: a known word matches legacy content', () => {
  const flat = unwrapMorphology(read(1))
  // 1:1:1 describes bismillah — carries the root sīn mīm wāw.
  assert.ok(flat['1:1:1'].includes('س م و'))
})
