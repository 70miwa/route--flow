import {
  lineString,
  point,
  pointToLineDistance,
  nearestPointOnLine,
  bearing as turfBearing,
} from '@turf/turf'

const REPORT_MATCH_M = 80
const TELEMETRY_MATCH_M = 100
const TELEMETRY_CLUSTER_KM = 0.75
const MAX_COMMUNITY_DELAY_MIN = 25
const MAX_TELEMETRY_DELAY_MIN = 40

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const minutes = (seconds) => seconds / 60

function ageMinutes(iso) {
  const normalized = iso?.includes('T') ? iso : `${iso?.replace(' ', 'T')}Z`
  const time = new Date(normalized).getTime()
  return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 60_000) : 10_000
}

function freshness(iso, lifetimeMinutes) {
  return clamp(1 - ageMinutes(iso) / lifetimeMinutes, 0, 1)
}

/** Confidence rises with confirmations and decays as a report ages. */
export function reportConfidence(report) {
  const confirms = Number(report.confirms) || 0
  const disputes = Number(report.disputes) || 0
  const voteScore = clamp(0.52 + confirms * 0.12 - disputes * 0.2, 0.05, 1)
  return freshness(report.created_at, 24 * 60) * voteScore
}

function telemetryWeight(sample) {
  const recency = freshness(sample.recorded_at, 20)
  const accuracy = sample.accuracy_m == null ? 0.75 : clamp(1 - sample.accuracy_m / 140, 0.2, 1)
  return recency * accuracy
}

export function telemetryDelay(line, route, samples) {
  const expectedSpeedKph = clamp(
    (route.distanceMeters / 1000) / (route.baseDurationSec / 3600),
    18,
    90
  )
  const clusters = new Map()

  for (const sample of samples) {
    const p = point([sample.lng, sample.lat])
    const distanceKm = pointToLineDistance(p, line, { units: 'kilometers' })
    if (distanceKm * 1000 > TELEMETRY_MATCH_M) continue

    const snapped = nearestPointOnLine(line, p, { units: 'kilometers' })
    const locationKm = Number(snapped.properties.location) || 0
    const bucket = Math.floor(locationKm / TELEMETRY_CLUSTER_KM)
    const weight = telemetryWeight(sample)
    if (weight <= 0) continue

    const cluster = clusters.get(bucket) || { weightedSpeed: 0, weight: 0, count: 0 }
    cluster.weightedSpeed += clamp(Number(sample.speed_kph) || 0, 4, 150) * weight
    cluster.weight += weight
    cluster.count += 1
    clusters.set(bucket, cluster)
  }

  let delayMin = 0
  let weightedObservedSpeed = 0
  let observedWeight = 0
  let sampleCount = 0

  for (const cluster of clusters.values()) {
    const observedSpeedKph = cluster.weightedSpeed / cluster.weight
    const confidence = clamp(cluster.weight / 2.2, 0.15, 1)
    const segmentKm = Math.min(1.25, route.distanceMeters / 1000)
    const observedMinutes = (segmentKm / observedSpeedKph) * 60
    const expectedMinutes = (segmentKm / expectedSpeedKph) * 60
    delayMin += clamp((observedMinutes - expectedMinutes) * confidence, 0, 8)
    weightedObservedSpeed += observedSpeedKph * cluster.weight
    observedWeight += cluster.weight
    sampleCount += cluster.count
  }

  return {
    telemetryDelayMin: Math.min(delayMin, MAX_TELEMETRY_DELAY_MIN),
    observedSpeedKph: observedWeight ? weightedObservedSpeed / observedWeight : null,
    expectedSpeedKph,
    telemetrySamples: sampleCount,
  }
}

/** Annotate a candidate with report risk, observed traffic, and adjusted ETA. */
export function annotateRoute(route, reports, telemetry = []) {
  const line = lineString(route.geometry)
  const touching = []

  for (const report of reports) {
    const distanceKm = pointToLineDistance(point([report.lng, report.lat]), line, {
      units: 'kilometers',
    })
    if (distanceKm * 1000 <= REPORT_MATCH_M) {
      touching.push({ ...report, confidence: reportConfidence(report) })
    }
  }

  const blocking = touching.filter(
    (report) => report.status === 'blocked' && report.confidence >= 0.34
  )
  const slow = touching.filter(
    (report) => report.status === 'slow' && report.confidence >= 0.12
  )
  const blockConfidence = blocking.reduce(
    (highest, report) => Math.max(highest, report.confidence),
    0
  )
  const communityDelayMin = Math.min(
    slow.reduce((total, report) => total + 5 * report.confidence, 0),
    MAX_COMMUNITY_DELAY_MIN
  )
  const traffic = telemetryDelay(line, route, telemetry)
  const baseEtaMin = minutes(route.baseDurationSec)
  const trafficDelayMin = communityDelayMin + traffic.telemetryDelayMin

  let status = 'clear'
  if (blocking.length) status = 'blocked'
  else if (trafficDelayMin >= 1.5) status = 'slow'

  const congestionRatio = trafficDelayMin / Math.max(baseEtaMin, 1)
  const congestion =
    status === 'blocked'
      ? 'blocked'
      : congestionRatio >= 0.3
        ? 'heavy'
        : congestionRatio >= 0.12
          ? 'moderate'
          : congestionRatio > 0.02
            ? 'light'
            : 'free-flowing'

  const dataConfidence = clamp(
    touching.reduce((sum, report) => sum + report.confidence, 0) * 0.18 +
      traffic.telemetrySamples * 0.08,
    0,
    0.98
  )

  return {
    id: `r${route.index}`,
    geometry: route.geometry,
    roadNames: route.roadNames || [],
    distanceKm: route.distanceMeters / 1000,
    baseEtaMin,
    adjustedEtaMin: baseEtaMin + trafficDelayMin,
    trafficDelayMin,
    communityDelayMin,
    telemetryDelayMin: traffic.telemetryDelayMin,
    expectedSpeedKph: traffic.expectedSpeedKph,
    observedSpeedKph: traffic.observedSpeedKph,
    telemetrySamples: traffic.telemetrySamples,
    confidence: dataConfidence,
    congestion,
    status,
    travelable: status !== 'blocked',
    touchingHintIds: touching.map((report) => report.id),
    blockedBy: blocking.map((report) => ({
      id: report.id,
      lat: report.lat,
      lng: report.lng,
      road_name: report.road_name,
      note: report.note,
      confidence: report.confidence,
    })),
    blockConfidence,
  }
}

/**
 * Pick the route with the lowest credible arrival time. A small theoretical
 * saving is ignored to prevent low-confidence samples from causing route churn.
 */
export function classifyRoutes(routes, reports, telemetry = []) {
  const annotated = routes.map((route) => annotateRoute(route, reports, telemetry))
  const defaultRoute = annotated.reduce((best, route) =>
    route.baseEtaMin < best.baseEtaMin ? route : best
  )
  const passable = annotated.filter((route) => route.travelable)

  let recommended
  if (!passable.length) {
    recommended = [...annotated].sort(
      (a, b) => a.blockConfidence - b.blockConfidence || a.adjustedEtaMin - b.adjustedEtaMin
    )[0]
  } else {
    const fastestAdjusted = [...passable].sort(
      (a, b) => a.adjustedEtaMin - b.adjustedEtaMin
    )[0]
    if (!defaultRoute.travelable) {
      recommended = fastestAdjusted
    } else {
      const meaningfulSavingMin = Math.max(2, defaultRoute.adjustedEtaMin * 0.05)
      recommended =
        defaultRoute.adjustedEtaMin - fastestAdjusted.adjustedEtaMin >= meaningfulSavingMin
          ? fastestAdjusted
          : defaultRoute
    }
  }

  const ranked = [...annotated].sort((a, b) => {
    if (a.id === recommended.id) return -1
    if (b.id === recommended.id) return 1
    if (a.travelable !== b.travelable) return a.travelable ? -1 : 1
    return a.adjustedEtaMin - b.adjustedEtaMin
  })

  for (const route of ranked) {
    route.recommended = route.id === recommended.id
    route.isDefault = route.id === defaultRoute.id
    route.timeDifferenceMin = Math.round(route.adjustedEtaMin - recommended.adjustedEtaMin)
  }

  const rerouted = recommended.id !== defaultRoute.id
  const signedDelta = recommended.adjustedEtaMin - defaultRoute.adjustedEtaMin
  const timeSavedMin = Math.max(0, Math.round(-signedDelta))
  const detourCostMin = Math.max(0, Math.round(signedDelta))

  let advice = 'The usual route remains the quickest reliable option.'
  if (!passable.length) {
    advice = 'No route is currently confirmed passable. Travel only with caution.'
  } else if (!defaultRoute.travelable) {
    advice = `The usual route is blocked. This alternative is the quickest passable option${
      detourCostMin ? ` and adds about ${detourCostMin} min` : ''
    }.`
  } else if (rerouted && timeSavedMin > 0) {
    advice = `Live road data indicates this route should save about ${timeSavedMin} min.`
  } else if (defaultRoute.status === 'slow') {
    advice = 'Traffic is slower than normal, but the alternatives would take longer.'
  }

  return {
    routes: ranked,
    recommendedId: recommended.id,
    recommendedStatus: recommended.status,
    defaultBlocked: !defaultRoute.travelable,
    rerouted,
    deltaMin: Math.round(signedDelta),
    timeSavedMin,
    detourCostMin,
    allBlocked: passable.length === 0,
    advice,
    generatedAt: new Date().toISOString(),
  }
}

/** Generate perpendicular waypoints around a point on a route. */
export function detourWaypoints(routeGeometry, blockPoint) {
  const line = lineString(routeGeometry)
  const snapped = nearestPointOnLine(line, point([blockPoint.lng, blockPoint.lat]))
  const index = snapped.properties.index ?? 0
  const a = routeGeometry[Math.max(0, index)]
  const b = routeGeometry[Math.min(routeGeometry.length - 1, index + 1)]
  const heading = turfBearing(point(a), point(b))

  const waypoints = []
  for (const side of [90, -90]) {
    for (const distanceKm of [2.5, 4.5]) {
      const bearing = ((heading + side) % 360 + 360) % 360
      const destination = destinationPoint(snapped.geometry.coordinates, distanceKm, bearing)
      waypoints.push({ lat: destination[1], lng: destination[0] })
    }
  }
  return waypoints
}

function destinationPoint([lng, lat], distanceKm, bearingDeg) {
  const radiusKm = 6371
  const bearing = (bearingDeg * Math.PI) / 180
  const lat1 = (lat * Math.PI) / 180
  const lng1 = (lng * Math.PI) / 180
  const angularDistance = distanceKm / radiusKm
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    )
  return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]
}
