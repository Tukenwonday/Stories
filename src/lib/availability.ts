import type { NotServedWindow } from "../types"

export type UnavailableReason = "stock" | "date" | "time"

export interface AvailabilitySource {
  isAvailable?: boolean
  unavailableDates?: string[]
  notServedWindows?: NotServedWindow[]
}

export function getUnavailableReason(
  item: AvailabilitySource,
  now = new Date(),
): UnavailableReason | null {
  if (item.isAvailable === false) return "stock"
  if (item.unavailableDates?.includes(toDateKey(now))) return "date"
  if ((item.notServedWindows ?? []).some((w) => isInWindow(w, now))) return "time"
  return null
}

export function isItemAvailable(item: AvailabilitySource, now = new Date()): boolean {
  return getUnavailableReason(item, now) === null
}

function isInWindow(w: NotServedWindow, now: Date): boolean {
  const fromMin = toMinutes(w.from)
  const toMin = toMinutes(w.to)
  if (fromMin == null || toMin == null) return false
  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (fromMin <= toMin) {
    return nowMin >= fromMin && nowMin < toMin
  }
  return nowMin >= fromMin || nowMin < toMin
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function toMinutes(t: string): number | null {
  const parts = t.split(":").map((p) => parseInt(p, 10))
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null
  const hours = parts[0]
  if (hours < 0 || hours > 24) return null
  return hours * 60 + parts[1]
}
