import type {
  AddressDetails,
  LatLng,
  Place,
  Report,
  ReportStatus,
  RouteResponse,
  User,
} from './types'

/** Thrown for non-2xx API responses, carrying the server's message. */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status)
  }
  return data as T
}

// --- Auth ---
export const authApi = {
  me: () => request<{ user: User }>('/api/auth/me'),
  signup: (body: { username: string; email: string; password: string }) =>
    request<{ user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  requestReset: (email: string) =>
    request<{ ok: true; message: string; devToken?: string }>('/api/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: true; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
}

// --- Reports (hints) ---
export const reportsApi = {
  list: (hours = 48) =>
    request<{ reports: Report[] }>(`/api/reports?hours=${hours}`),
  create: (body: {
    lat: number
    lng: number
    status: ReportStatus
    note?: string
    road_name?: string
  }) =>
    request<{ report: Report }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  vote: (id: number, vote: 'confirm' | 'dispute') =>
    request<{ report: Report }>(`/api/reports/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    }),
  remove: (id: number) =>
    request<{ ok: true }>(`/api/reports/${id}`, { method: 'DELETE' }),
}

// --- Routing ---
export const routeApi = {
  compute: (origin: LatLng, dest: LatLng) =>
    request<RouteResponse>('/api/route', {
      method: 'POST',
      body: JSON.stringify({ origin, dest }),
    }),
}

export const telemetryApi = {
  record: (body: {
    lat: number
    lng: number
    speed_kph: number
    accuracy_m?: number
    heading_deg?: number
  }) =>
    request<{ ok: true }>('/api/telemetry', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

// --- Geocoding (server proxy; bounded to Ogun) ---
export async function geocode(query: string): Promise<Place[]> {
  if (!query.trim()) return []
  try {
    const params = new URLSearchParams({ q: query })
    const res = await fetch(`/api/geocode/search?${params.toString()}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { places?: Place[] }
    return data.places || []
  } catch {
    return []
  }
}

/** Reverse geocode a point into a full address and road context. */
export async function reverseGeocodeDetails(
  lat: number,
  lng: number
): Promise<AddressDetails | null> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    })
    const res = await fetch(`/api/geocode/reverse?${params.toString()}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { place?: AddressDetails }
    return data.place || null
  } catch {
    return null
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const details = await reverseGeocodeDetails(lat, lng)
  return details?.label || ''
}
