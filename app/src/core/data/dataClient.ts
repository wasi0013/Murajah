import {
  indexPath,
  morphologyPath,
  pageCount,
  pagePath,
  tafsirPath,
  translationPath,
  MANIFEST_PATH,
} from './paths'
import type { Transport } from './transport'
import type {
  Layout,
  Manifest,
  MorphologyChunk,
  NavIndex,
  PageChunk,
  SurahNames,
  TafsirChunk,
  TafsirLang,
  TafsirMapping,
  TranslationChunk,
  WbwLang,
} from './types'

/**
 * Typed data access over an injectable Transport. Path construction lives in
 * pure `paths.ts`; the Transport handles fetch/parse (+ dedupe cache). In
 * production the Transport is a Web Worker, so this whole surface is off the
 * main thread.
 */
export class DataClient {
  private manifest: Manifest | null = null
  private readonly transport: Transport

  constructor(transport: Transport) {
    this.transport = transport
  }

  /** Load the (tiny) data manifest. Must be awaited before other calls. */
  async init(): Promise<Manifest> {
    if (!this.manifest) {
      this.manifest = await this.transport.fetchJson<Manifest>(MANIFEST_PATH)
      // Let a persistent-cache transport purge stale chunks on a new deploy.
      this.transport.setVersion?.(this.manifest.version)
    }
    return this.manifest
  }

  private get m(): Manifest {
    if (!this.manifest) throw new Error('DataClient: call init() before use')
    return this.manifest
  }

  pageCount(layout: Layout): number {
    return pageCount(this.m, layout)
  }

  getPage(layout: Layout, page: number): Promise<PageChunk> {
    return this.transport.fetchJson<PageChunk>(pagePath(this.m, layout, page))
  }

  getTranslations(lang: WbwLang, surah: number): Promise<TranslationChunk> {
    return this.transport.fetchJson<TranslationChunk>(translationPath(this.m, lang, surah))
  }

  getTafsir(lang: TafsirLang, surah: number): Promise<TafsirChunk> {
    return this.transport.fetchJson<TafsirChunk>(tafsirPath(this.m, lang, surah))
  }

  /** Per-surah morphology (location → HTML analysis). Lazy; prefetch by surah. */
  getMorphology(surah: number): Promise<MorphologyChunk> {
    return this.transport.fetchJson<MorphologyChunk>(morphologyPath(this.m, surah))
  }

  getSurahNames(): Promise<SurahNames> {
    return this.transport.fetchJson<SurahNames>(indexPath(this.m, 'surahNames'))
  }

  getTafsirMapping(layout: Layout): Promise<TafsirMapping> {
    const name = layout === 'qpc' ? 'tafsirMapQpc' : 'tafsirMapIndopak'
    return this.transport.fetchJson<TafsirMapping>(indexPath(this.m, name))
  }

  /** Quick-jump index (ayah/surah/juz → page) for a layout. Loaded once, cached. */
  getNavIndex(layout: Layout): Promise<NavIndex> {
    const name = layout === 'qpc' ? 'navQpc' : 'navIndopak'
    return this.transport.fetchJson<NavIndex>(indexPath(this.m, name))
  }

  /**
   * Warm the cache for a page (and clamp to valid range). Fire-and-forget:
   * errors are swallowed so prefetch never surfaces to the UI.
   */
  prefetchPage(layout: Layout, page: number): void {
    if (page < 1 || page > this.pageCount(layout)) return
    void this.getPage(layout, page).catch(() => {})
  }
}
