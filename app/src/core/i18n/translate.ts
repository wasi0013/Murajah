// Pure translation primitives: resolve a dotted key against a catalog tree and
// fill `{name}` placeholders. No Vue, no DOM, no I/O — so they unit-test in
// isolation and the reactive runtime is a thin wrapper over them.

import type { Messages, TranslateParams } from './types'

/**
 * Look up `key` (e.g. `settings.appearance.theme`) in `messages`. Returns the
 * leaf string, or `undefined` if any segment is missing or the leaf is a subtree
 * rather than a string — letting the caller fall back to another catalog.
 */
export function resolveMessage(messages: Messages, key: string): string | undefined {
  let node: string | Messages = messages
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || !(part in node)) return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * Replace `{name}` placeholders with `params.name`. Unknown placeholders are
 * left verbatim so a missing param is visible rather than silently blanked.
 */
export function interpolate(template: string, params: TranslateParams): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}
