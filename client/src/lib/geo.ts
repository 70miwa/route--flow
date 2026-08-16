import type { ReportStatus } from './types'

// --- Ogun State geography ---
export const OGUN_CENTER: [number, number] = [7.0, 3.45]
export const OGUN_DEFAULT_ZOOM = 9
// Nominatim viewbox: "lon1,lat1,lon2,lat2" (two opposite corners)
export const OGUN_VIEWBOX = '2.55,8.05,4.75,6.15'

// --- Status presentation ---
export const STATUS_META: Record<
  ReportStatus,
  { label: string; color: string; text: string; dot: string; verb: string }
> = {
  clear: {
    label: 'Clear',
    color: '#16a34a',
    text: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    verb: 'Passable',
  },
  slow: {
    label: 'Slow',
    color: '#f59e0b',
    text: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    verb: 'Busy',
  },
  blocked: {
    label: 'Blocked',
    color: '#ef4444',
    text: 'text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
    verb: 'Blocked',
  },
}

// --- Formatting ---
export function formatEta(minutes: number): string {
  const m = Math.max(1, Math.round(minutes))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h} hr ${rem} min` : `${h} hr`
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(km < 10 ? 1 : 0)} km`
}

export function timeAgo(iso: string): string {
  // SQLite datetime('now') is UTC without a timezone marker — normalize it.
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  const secs = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

/** Convert OSRM [lng,lat] pairs to Leaflet [lat,lng] pairs. */
export function toLatLng(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng])
}

export function netVotes(r: { confirms: number; disputes: number }): number {
  return r.confirms - r.disputes
}
