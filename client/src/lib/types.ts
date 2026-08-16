export type ReportStatus = 'blocked' | 'slow' | 'clear'

export interface User {
  id: number
  username: string
  email: string
}

export interface LatLng {
  lat: number
  lng: number
}

export interface GeoFix extends LatLng {
  accuracy: number
  speedKph: number | null
  heading: number | null
  timestamp: number
}

export interface AddressDetails {
  label: string
  road: string
  area: string
}

export interface Report {
  id: number
  lat: number
  lng: number
  road_name: string | null
  status: ReportStatus
  note: string | null
  created_at: string
  user_id: number
  author: string
  confirms: number
  disputes: number
  my_vote: 'confirm' | 'dispute' | null
}

/** A single classified candidate route. geometry is [lng, lat] pairs. */
export interface RouteOption {
  id: string
  geometry: [number, number][]
  roadNames: string[]
  distanceKm: number
  baseEtaMin: number
  adjustedEtaMin: number
  trafficDelayMin: number
  communityDelayMin: number
  telemetryDelayMin: number
  expectedSpeedKph: number
  observedSpeedKph: number | null
  telemetrySamples: number
  confidence: number
  congestion: 'free-flowing' | 'light' | 'moderate' | 'heavy' | 'blocked'
  status: ReportStatus
  travelable: boolean
  touchingHintIds: number[]
  blockedBy: {
    id: number
    road_name: string | null
    note: string | null
    confidence: number
  }[]
  recommended: boolean
  isDefault: boolean
  timeDifferenceMin: number
}

export interface RouteResponse {
  routes: RouteOption[]
  recommendedId: string
  recommendedStatus: ReportStatus
  defaultBlocked: boolean
  rerouted: boolean
  deltaMin: number
  timeSavedMin: number
  detourCostMin: number
  allBlocked: boolean
  advice: string
  generatedAt: string
}

/** A geocoded place from Nominatim search. */
export interface Place {
  label: string
  lat: number
  lng: number
  road?: string
  area?: string
}

export type Endpoint = 'origin' | 'dest'
