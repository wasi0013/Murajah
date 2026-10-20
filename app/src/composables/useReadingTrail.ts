import { computed, watch } from 'vue'
import { surahsOnPage } from '@/core/quran/surahPages'
import { SURAH_NAMES } from '@/core/navigation/surahNames'
import { locale, t } from '@/core/i18n'
import { useReadingTrailStore, type TrailScheme } from '@/stores/readingTrail'

export interface ReadingTrailSource {
  /** Which page numbering the view's `page` is in. */
  scheme: () => TrailScheme
  page: () => number
  /**
   * True once the view is on the page it will actually show. Until then the page
   * can still be a store default (1) that a deep link or saved last page is about
   * to replace, and recording it would put a page the reader never opened on the
   * trail (and offer "back" to it).
   */
  ready: () => boolean
}

/** A trail entry as the quick-jump palette lists it. */
export interface RecentPage {
  page: number
  label: string
  meta: string
}

/**
 * Feeds a reading view's page into the reading trail and exposes what the view
 * shows of it: the recent spots (for the quick-jump palette) and the "back to"
 * page offered right after a hop. The first page recorded after `ready`, and the
 * page after a layout switch, count as arriving, not hopping.
 */
export function useReadingTrail(source: ReadingTrailSource) {
  const store = useReadingTrailStore()
  let lastScheme: TrailScheme | null = null

  watch(
    () => [source.ready(), source.scheme(), source.page()] as const,
    async ([ready, scheme, page]) => {
      if (!ready) return
      await store.hydrate()
      if (scheme !== lastScheme) {
        lastScheme = scheme
        store.settle(scheme, page)
      } else store.visit(scheme, page)
    },
    { immediate: true },
  )

  const backTo = computed(() => {
    const b = store.backTo
    return b && b.scheme === source.scheme() ? b.page : null
  })

  /**
   * The spots to go back to, labelled. A function, not a computed: the "how long
   * ago" part must be as of when the palette opens, not the last page turn.
   */
  function recentPages(): RecentPage[] {
    const scheme = source.scheme()
    const now = Date.now()
    return store.recent(scheme).map((e) => ({
      page: e.page,
      label: t('common.page', { n: e.page }),
      meta: [scheme === 'qpc' ? surahLabel(e.page) : '', timeAgo(e.at, now)].filter(Boolean).join(' · '),
    }))
  }

  return { backTo, recentPages, dismissBack: store.dismissBack }
}

/** The (first) surah on a QPC page, by its transliterated name — offline, no fetch. */
function surahLabel(page: number): string {
  const surah = surahsOnPage(page)[0]
  return surah ? (SURAH_NAMES[surah - 1] ?? '') : ''
}

/** "5 min. ago", "yesterday"… in the UI language, via the platform's own wording. */
export function timeAgo(at: number, now: number): string {
  if (typeof Intl === 'undefined' || typeof Intl.RelativeTimeFormat !== 'function') return ''
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto', style: 'short' })
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return rtf.format(0, 'second')
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute')
  if (s < 86_400) return rtf.format(-Math.floor(s / 3600), 'hour')
  return rtf.format(-Math.floor(s / 86_400), 'day')
}
