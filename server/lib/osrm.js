import { OSRM_URL } from '../config.js'

/**
 * Low-level OSRM driving query through an ordered list of waypoints.
 * @param {{lat:number,lng:number}[]} points  ordered waypoints (>=2)
 * @param {{alternatives?:number}} opts
 * @returns normalized route objects [{index, geometry:[lng,lat][], distanceMeters, baseDurationSec}]
 */
async function osrmQuery(points, { alternatives = 0 } = {}) {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';')
  const alt = alternatives > 0 ? `alternatives=${alternatives}` : 'alternatives=false'
  const url =
    `${OSRM_URL}/route/v1/driving/${coords}` +
    `?${alt}&overview=full&geometries=geojson&steps=true&annotations=false`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  let res
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Route-Flow/1.0 (Ogun State road status app)' },
    })
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      throw new Error('Routing service timed out. Please try again.')
    }
    throw new Error('Could not reach the routing service.')
  }
  clearTimeout(timeout)

  if (!res.ok) throw new Error(`Routing service error (${res.status}).`)
  const data = await res.json()
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) {
    throw new Error('No driving route found between those points.')
  }

  return data.routes.map(normalizeOsrmRoute)
}

export function normalizeOsrmRoute(route, index) {
  const roadNames = []
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      const name = step.name?.trim() || ''
      const ref = step.ref?.trim() || ''
      const label = name && ref && !name.includes(ref) ? `${name} (${ref})` : name || ref
      if (label && roadNames[roadNames.length - 1] !== label && !roadNames.includes(label)) {
        roadNames.push(label)
      }
    }
  }

  return {
    index,
    geometry: route.geometry.coordinates,
    distanceMeters: route.distance,
    baseDurationSec: route.duration,
    roadNames: roadNames.slice(0, 5),
  }
}

/** Fetch driving routes (with alternatives) between origin and dest. */
export async function fetchRoutes(origin, dest) {
  return osrmQuery([origin, dest], { alternatives: 3 })
}

/**
 * Fetch a single route from origin to dest that passes through `via`.
 * Returns one normalized route, or null if OSRM can't route it.
 */
export async function fetchRouteVia(origin, via, dest) {
  try {
    const routes = await osrmQuery([origin, via, dest], { alternatives: 0 })
    return routes[0] ?? null
  } catch {
    return null
  }
}
