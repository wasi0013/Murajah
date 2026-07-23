import { reactive } from 'vue'

export type ToastVariant = 'info' | 'success' | 'error'
export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
  /** Runs before dismissal when the toast itself is tapped — e.g. the PWA
   * update toast applying a pending refresh. Plain toasts just dismiss. */
  onAction?: () => void
}

// Module-level reactive store so toast() works from anywhere (no injection).
const items = reactive<ToastItem[]>([])
let nextId = 1

export function useToasts(): ToastItem[] {
  return items
}

export function dismissToast(id: number) {
  const i = items.findIndex((t) => t.id === id)
  if (i >= 0) items.splice(i, 1)
}

export function toast(
  message: string,
  opts: { variant?: ToastVariant; duration?: number; onAction?: () => void } = {},
): number {
  const id = nextId++
  items.push({ id, message, variant: opts.variant ?? 'info', onAction: opts.onAction })
  // duration: 0 disables auto-dismiss — for a toast that should stay until the
  // user acts or navigates away (e.g. the PWA update prompt).
  const duration = opts.duration ?? 3000
  if (duration > 0) setTimeout(() => dismissToast(id), duration)
  return id
}
