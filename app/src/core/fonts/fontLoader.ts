import { resolveUrl, type Transport } from '@/core/data/transport'
import { FONT_MANIFEST_PATH } from '@/core/data/paths'
import { fontFamily, fontPageCount, fontPath, type FontRequest } from './fontPaths'
import type { FontManifest } from './types'

/**
 * Loads per-page Quran fonts on demand using the CSS Font Loading API.
 *
 * Each QPC/tajweed page gets a unique family so page-specific glyph fonts never
 * collide. `ensure()` resolves only once the font is actually ready, so the
 * reader can await it and avoid both FOIT and wrong-glyph flashes. Neighbour
 * fonts are prefetched. Loaded faces are kept in a small LRU and removed from
 * `document.fonts` to bound memory. Indopak is a single font, loaded once.
 */
export class FontLoader {
  private manifest: FontManifest | null = null
  private readonly loaded = new Map<string, FontFace>()
  private readonly order: string[] = []
  private readonly maxFaces: number
  private readonly transport: Transport

  constructor(transport: Transport, maxFaces = 6) {
    this.transport = transport
    this.maxFaces = maxFaces
  }

  async init(): Promise<FontManifest> {
    if (!this.manifest) {
      this.manifest = await this.transport.fetchJson<FontManifest>(FONT_MANIFEST_PATH)
    }
    return this.manifest
  }

  private get m(): FontManifest {
    if (!this.manifest) throw new Error('FontLoader: call init() before use')
    return this.manifest
  }

  /** Load (if needed) the font for a page; resolves to its font-family name. */
  async ensure(req: FontRequest): Promise<string> {
    const family = fontFamily(req)
    const existing = this.loaded.get(family)
    if (existing) {
      this.touch(family)
      return family
    }

    const url = resolveUrl(fontPath(this.m, req))
    const face = new FontFace(family, `url(${url}) format('woff2')`, { display: 'block' })
    this.loaded.set(family, face)
    this.order.push(family)
    document.fonts.add(face)
    try {
      await face.load()
    } catch (err) {
      // Drop a failed face so a later attempt can retry cleanly.
      this.remove(family)
      throw err
    }
    this.evict()
    return family
  }

  /** Warm a neighbouring page's font without blocking (clamped to valid range). */
  prefetch(req: FontRequest): void {
    if (req.layout !== 'indopak') {
      const count = fontPageCount(this.m, req.layout, req.tajweed)
      if (req.page < 1 || req.page > count) return
    }
    void this.ensure(req).catch(() => {})
  }

  private touch(family: string): void {
    const i = this.order.indexOf(family)
    if (i >= 0) this.order.splice(i, 1)
    this.order.push(family)
  }

  private remove(family: string): void {
    const face = this.loaded.get(family)
    if (face) {
      document.fonts.delete(face)
      this.loaded.delete(family)
    }
    const i = this.order.indexOf(family)
    if (i >= 0) this.order.splice(i, 1)
  }

  private evict(): void {
    while (this.order.length > this.maxFaces) {
      // Keep the single reusable Indopak face hot; evict oldest per-page face.
      const oldest = this.order.find((f) => f !== 'indopak') ?? this.order[0]
      this.remove(oldest)
    }
  }
}
