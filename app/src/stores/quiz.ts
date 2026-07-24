import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'

/**
 * Per-page quiz accuracy (Phase 6.2) — the signal the weakness scorer consumes.
 *
 * Each page keeps a **bounded rolling window** of its most recent quiz outcomes
 * (`1` correct / `0` wrong), capped at {@link QUIZ_WINDOW}. Accuracy is the mean of
 * that window. This gives both properties the product owner asked for from one
 * simple rule: a **cap** (old results fall off the front) and **decay** (a page you
 * used to ace but have started failing recovers a weak signal within a few quizzes,
 * instead of a lifetime ratio burying it).
 *
 * Only durable accuracy lives here; live question/session state belongs to the quiz
 * view. The interface the scorer sees is just `page → 0..1`.
 */
export const QUIZ_WINDOW = 10

export const useQuizStore = defineStore('quiz', () => {
  /** page → recent outcomes (oldest first), length ≤ QUIZ_WINDOW. */
  const results = reactive(new Map<number, number[]>())

  function mean(arr: readonly number[]): number {
    return arr.reduce((a, b) => a + b, 0) / arr.length
  }

  /** Record one answered question for a page, evicting the oldest beyond the window. */
  function record(page: number, correct: boolean): void {
    const arr = results.get(page) ?? []
    arr.push(correct ? 1 : 0)
    if (arr.length > QUIZ_WINDOW) arr.splice(0, arr.length - QUIZ_WINDOW)
    results.set(page, arr)
  }

  /** A page's windowed accuracy (0–1), or `null` when it has never been quizzed. */
  function accuracy(page: number): number | null {
    const arr = results.get(page)
    return arr && arr.length > 0 ? mean(arr) : null
  }

  /** `page → accuracy` for every quizzed page — the exact input weaknessScorer wants. */
  const accuracyByPage = computed(() => {
    const out = new Map<number, number>()
    for (const [page, arr] of results) if (arr.length > 0) out.set(page, mean(arr))
    return out
  })

  /** Replace all windows (hydration / import). */
  function setAll(map: Map<number, number[]>): void {
    results.clear()
    for (const [page, arr] of map) results.set(page, arr.slice(-QUIZ_WINDOW))
  }

  /** A plain (non-reactive) copy for persistence. */
  function snapshot(): Map<number, number[]> {
    const copy = new Map<number, number[]>()
    for (const [page, arr] of results) copy.set(page, [...arr])
    return copy
  }

  return { results, record, accuracy, accuracyByPage, setAll, snapshot }
})
