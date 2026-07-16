import { reactive } from 'vue'

export type ToastVariant = 'info' | 'success' | 'error'
export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
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
  opts: { variant?: ToastVariant; duration?: number } = {},
): number {
  const id = nextId++
  items.push({ id, message, variant: opts.variant ?? 'info' })
  const duration = opts.duration ?? 3000
  if (duration > 0) setTimeout(() => dismissToast(id), duration)
  return id
}
