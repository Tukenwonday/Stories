const CAFE_LAT = Number(import.meta.env.VITE_CAFE_LAT)
const CAFE_LNG = Number(import.meta.env.VITE_CAFE_LNG)
const CAFE_RADIUS_M = Number(import.meta.env.VITE_CAFE_RADIUS_M) || 50

export type LocationStatus = "ok" | "denied" | "outOfRange" | "unsupported"

export function haversineDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("unsupported"))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    })
  })
}

/**
 * Checks the user's GPS position against the configured cafe radius.
 * When the cafe coordinates aren't configured the gate is skipped entirely.
 */
export async function verifyLocation(): Promise<LocationStatus> {
  if (!Number.isFinite(CAFE_LAT) || !Number.isFinite(CAFE_LNG)) return "ok"
  try {
    const pos = await getCurrentPosition()
    const distance = haversineDistanceM(pos.coords.latitude, pos.coords.longitude, CAFE_LAT, CAFE_LNG)
    return distance <= CAFE_RADIUS_M ? "ok" : "outOfRange"
  } catch (err) {
    const code = (err as GeolocationPositionError)?.code
    return code === 1 ? "denied" : "unsupported"
  }
}
