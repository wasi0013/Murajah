import { resolveUrl } from '@/core/data/transport'
import { createImageTransport, type ImageTransport } from './imageTransport'
import {
  MUSHAF_MANIFEST_PATH,
  dimensions,
  imagePath,
  inRange,
  type MushafManifest,
  type PageSize,
} from './manifest'

/**
 * Data access for the mushaf image surface: loads the image manifest once, then
 * resolves page → path / dimensions (pure, from the manifest) and fetches page
 * Blobs through a cached ImageTransport. Kept out of the reader bundle — only
 * the code-split mushaf route imports this.
 */
export class MushafClient {
  private manifest: MushafManifest | null = null
  private manifestPromise: Promise<MushafManifest> | null = null
  private readonly transport: ImageTransport

  constructor(transport: ImageTransport = createImageTransport()) {
    this.transport = transport
  }

  /** Load the (tiny) image manifest once. Must be awaited before other calls. */
  init(): Promise<MushafManifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = this.loadManifest().catch((err) => {
        this.manifestPromise = null // allow retry on transient failure
        throw err
      })
    }
    return this.manifestPromise
  }

  private async loadManifest(): Promise<MushafManifest> {
    const res = await fetch(resolveUrl(MUSHAF_MANIFEST_PATH))
    if (!res.ok) throw new Error(`mushaf manifest: ${res.status}`)
    const m = (await res.json()) as MushafManifest
    this.manifest = m
    // A new image set purges the image cache; the immutable scans keep a stable
    // version, so redeploys don't re-download.
    this.transport.setVersion(m.version)
    return m
  }

  private get m(): MushafManifest {
    if (!this.manifest) throw new Error('MushafClient: call init() before use')
    return this.manifest
  }

  pageCount(): number {
    return this.m.pageCount
  }

  /** App-relative image URL for a page (for prefetch / `<link>` hints). */
  imagePath(page: number): string {
    return imagePath(this.m, page)
  }

  /** Intrinsic dimensions for aspect-ratio boxing (avoids CLS). */
  dimensions(page: number): PageSize {
    return dimensions(this.m, page)
  }

  inRange(page: number): boolean {
    return inRange(this.m, page)
  }

  /** Fetch a page image as a Blob (cached). Rejects for out-of-range pages. */
  getPageBlob(page: number): Promise<Blob> {
    if (!inRange(this.m, page)) {
      return Promise.reject(new Error(`mushaf page out of range: ${page}`))
    }
    return this.transport.fetchBlob(imagePath(this.m, page))
  }

  /**
   * Warm the cache for pages (clamped to range). Fire-and-forget: errors are
   * swallowed so prefetch never surfaces to the UI.
   */
  prefetch(pages: number[]): void {
    for (const page of pages) {
      if (inRange(this.m, page)) void this.transport.fetchBlob(imagePath(this.m, page)).catch(() => {})
    }
  }
}

let singleton: MushafClient | null = null

/** Shared app-wide MushafClient (lazily created on the mushaf route). */
export function getMushafClient(): MushafClient {
  if (!singleton) singleton = new MushafClient()
  return singleton
}
