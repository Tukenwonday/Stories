export type UnavailableReason = "stock" | "date" | "time"

export interface AvailabilitySource {
  isAvailable?: boolean
  unavailableDates?: string[]
  availableFrom?: string | null
  availableTo?: string | null
}

export function getUnavailableReason(
  item: AvailabilitySource,
  now = new Date(),
): UnavailableReason | null {
  if (item.isAvailable === false) return "stock"
  if (item.unavailableDates?.includes(toDateKey(now))) return "date"
  if (!withinTimeWindow(item, now)) return "time"
  return null
}

export function isItemAvailable(item: AvailabilitySource, now = new Date()): boolean {
  return getUnavailableReason(item, now) === null
}

function withinTimeWindow(
  item: { availableFrom?: string | null; availableTo?: string | null },
  now = new Date(),
): boolean {
  const from = item.availableFrom
  const to = item.availableTo
  if (!from && !to) return true
  if (!from || !to) return true

  const fromMin = toMinutes(from)
  const toMin = toMinutes(to)
  if (fromMin == null || toMin == null) return true

  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (fromMin <= toMin) {
    return nowMin >= fromMin && nowMin <= toMin
  }
  return nowMin >= fromMin || nowMin <= toMin
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
  if (hours < 0 || hours > 23) return null
  return hours * 60 + parts[1]
}
