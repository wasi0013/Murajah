// Emitted by data-pipeline/src/copy-fonts.mjs (app/public/fonts/manifest.json).

export interface PerPageFont {
  family: string
  pathTemplate: string // contains {page}
  pages: number
  color?: boolean
}

export interface SingleFont {
  family: string
  path: string
}

export interface FontManifest {
  qpc: PerPageFont
  tajweed: PerPageFont
  indopak: SingleFont
}
