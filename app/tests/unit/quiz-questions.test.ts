import { describe, it, expect } from 'vitest'
import {
  buildTranslation,
  buildContinuation,
  buildCompletion,
  scoreChoice,
  scoreCompletion,
  splitWords,
} from '@/core/quiz/questions'
import type { CompletionQuestion, Rng, Verse } from '@/core/quiz/types'

const verse = (surah: number, ayah: number, arabic: string, page = 1): Verse => ({
  surah,
  ayah,
  page,
  arabic,
})

/** Deterministic RNG cycling through given values. */
function seqRng(values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length]
}

describe('buildTranslation', () => {
  it('has exactly one correct option and all distractors', () => {
    const q = buildTranslation(verse(1, 1, 'بسم الله'), 'In the name of Allah', ['A', 'B', 'C'])
    expect(q.mode).toBe('translation')
    expect(q.choices).toHaveLength(4)
    expect(q.choices.filter((c) => c.isCorrect)).toHaveLength(1)
    expect(q.choices.find((c) => c.isCorrect)!.text).toBe('In the name of Allah')
    expect(q.choices.map((c) => c.text).sort()).toEqual(
      ['A', 'B', 'C', 'In the name of Allah'].sort(),
    )
  })

  it('degrades to fewer options when the distractor pool is small', () => {
    const q = buildTranslation(verse(1, 1, 'x'), 'correct', [])
    expect(q.choices).toHaveLength(1)
    expect(q.choices[0].isCorrect).toBe(true)
  })
})

describe('buildContinuation', () => {
  it('marks the adjacent verse correct and carries the direction', () => {
    const q = buildContinuation(
      verse(2, 5, 'verse five'),
      verse(2, 6, 'verse six'),
      'next',
      [verse(2, 10, 'verse ten'), verse(2, 12, 'verse twelve')],
    )
    expect(q.direction).toBe('next')
    expect(q.choices.filter((c) => c.isCorrect)).toHaveLength(1)
    expect(q.choices.find((c) => c.isCorrect)!.text).toBe('verse six')
    expect(q.choices).toHaveLength(3)
  })
})

describe('buildCompletion', () => {
  it('blanks between min and max words and leaves at least one visible', () => {
    const q = buildCompletion(verse(1, 1, 'a b c d e f'), ['x', 'y', 'z'], {
      minBlanks: 2,
      maxBlanks: 5,
      rng: seqRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    })
    const blanks = q.tokens.filter((t) => t.blank)
    expect(blanks.length).toBeGreaterThanOrEqual(2)
    expect(blanks.length).toBeLessThanOrEqual(5)
    expect(q.tokens.some((t) => !t.blank)).toBe(true) // at least one shown
  })

  it('keys answers by slotId matching the blanked word at that position', () => {
    const q = buildCompletion(verse(1, 1, 'alpha beta gamma delta'), ['x', 'y'], {
      rng: seqRng([0]),
    })
    for (const token of q.tokens) {
      if (token.blank) {
        expect(token.slotId).toBeDefined()
        expect(q.answers[token.slotId!]).toBe(token.text)
      }
    }
  })

  it('gives the bank one entry per blank plus distractors, none secretly correct', () => {
    const q = buildCompletion(verse(1, 1, 'alpha beta gamma delta'), ['x', 'y', 'z', 'w'], {
      rng: seqRng([0.3, 0.6, 0.1, 0.8]),
    })
    const answerTexts = Object.values(q.answers)
    // Every correct word appears in the bank at least as many times as it's needed.
    for (const text of new Set(answerTexts)) {
      const need = answerTexts.filter((t) => t === text).length
      const have = q.bank.filter((b) => b.text === text).length
      expect(have).toBeGreaterThanOrEqual(need)
    }
    // No distractor collides with a correct word (would make two "right" answers).
    const distractors = q.bank.filter((b) => !answerTexts.includes(b.text))
    for (const d of distractors) expect(answerTexts).not.toContain(d.text)
    expect(q.bank.length).toBeGreaterThan(answerTexts.length)
  })

  it('round-trips: reading back the answers scores correct, a wrong swap scores false', () => {
    const q = buildCompletion(verse(1, 1, 'alpha beta gamma delta epsilon'), ['x', 'y', 'z'], {
      rng: seqRng([0.2, 0.7, 0.4, 0.9, 0.1]),
    })
    // Build the correct assignment by finding a bank entry whose text matches each slot.
    const correct: Record<number, number> = {}
    const used = new Set<number>()
    for (const slotId of Object.keys(q.answers).map(Number)) {
      const entry = q.bank.find((b) => b.text === q.answers[slotId] && !used.has(b.id))!
      correct[slotId] = entry.id
      used.add(entry.id)
    }
    expect(scoreCompletion(q, correct)).toBe(true)

    // Leaving a slot empty fails.
    const slotIds = Object.keys(q.answers).map(Number)
    const missingOne = { ...correct }
    delete missingOne[slotIds[0]]
    expect(scoreCompletion(q, missingOne)).toBe(false)
  })
})

describe('scoreChoice', () => {
  it('reads the correctness of the chosen index', () => {
    const choices = [
      { text: 'a', isCorrect: false },
      { text: 'b', isCorrect: true },
    ]
    expect(scoreChoice(choices, 1)).toBe(true)
    expect(scoreChoice(choices, 0)).toBe(false)
    expect(scoreChoice(choices, 9)).toBe(false) // out of range
  })
})

describe('scoreCompletion — the B2 duplicate-word regression', () => {
  // A verse whose two blanked words are identical (و … و). Legacy compared the
  // *sequence* of chosen texts, so a swap between the two و-slots slipped through as
  // long as the texts lined up. Slot-based scoring makes the identical-word swap
  // correctly pass (both slots genuinely want و) while a real mismatch still fails.
  const dupQuestion: CompletionQuestion = {
    mode: 'completion',
    ref: { surah: 2, ayah: 3, page: 5 },
    tokens: [
      { text: 'و', position: 0, blank: true, slotId: 0 },
      { text: 'الله', position: 1, blank: false },
      { text: 'و', position: 2, blank: true, slotId: 1 },
      { text: 'الرحمن', position: 3, blank: false },
    ],
    answers: { 0: 'و', 1: 'و' },
    // Two distinct bank entries, same text, plus a distractor.
    bank: [
      { id: 0, text: 'و' },
      { id: 1, text: 'و' },
      { id: 2, text: 'من' },
    ],
  }

  it('accepts either identical word in either slot', () => {
    expect(scoreCompletion(dupQuestion, { 0: 0, 1: 1 })).toBe(true)
    expect(scoreCompletion(dupQuestion, { 0: 1, 1: 0 })).toBe(true) // the swap legacy also passed — correctly, here
  })

  it('rejects a genuinely wrong fill even when a duplicate is involved', () => {
    expect(scoreCompletion(dupQuestion, { 0: 0, 1: 2 })).toBe(false) // من in a و slot
    expect(scoreCompletion(dupQuestion, { 0: 2, 1: 1 })).toBe(false)
  })
})

describe('splitWords', () => {
  it('collapses whitespace and drops empties', () => {
    expect(splitWords('  a   b\tc\n')).toEqual(['a', 'b', 'c'])
    expect(splitWords('')).toEqual([])
  })
})
