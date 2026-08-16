import { Router } from 'express'
import { z } from 'zod'
import { fetchRoutes, fetchRouteVia } from '../lib/osrm.js'
import { classifyRoutes, detourWaypoints } from '../lib/classify.js'
import { listReports } from './reports.js'
import { listTelemetry } from './telemetry.js'

const router = Router()

const point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})
const routeSchema = z.object({ origin: point, dest: point })

// How many detour probes we'll fire at OSRM at most (public demo is rate-limited).
const MAX_DETOUR_PROBES = 6

/** A rough signature so we don't keep near-identical detour routes. */
function routeSignature(r) {
  return `${Math.round(r.distanceMeters / 100)}:${Math.round(r.baseDurationSec / 10)}`
}

/**
 * When every OSRM route is blocked, synthesize alternatives by routing through
 * waypoints offset around the blocked points, then return the combined set.
 */
async function withDetours(rawRoutes, classified, origin, dest) {
  // Collect candidate via-points around each blocked point (perpendicular offsets).
  const candidates = []
  for (const route of classified.routes) {
    if (route.status !== 'blocked' || !route.blockedBy.length) continue
    for (const block of route.blockedBy) {
      for (const wp of detourWaypoints(route.geometry, block)) {
        candidates.push(wp)
        if (candidates.length >= MAX_DETOUR_PROBES) break
      }
      if (candidates.length >= MAX_DETOUR_PROBES) break
    }
    if (candidates.length >= MAX_DETOUR_PROBES) break
  }
  if (!candidates.length) return null

  const probes = await Promise.all(
    candidates.map((wp) => fetchRouteVia(origin, wp, dest))
  )

  // Keep unique detours that aren't duplicates of a route we already have.
  const seen = new Set(rawRoutes.map(routeSignature))
  const detours = []
  for (const r of probes) {
    if (!r) continue
    const sig = routeSignature(r)
    if (seen.has(sig)) continue
    seen.add(sig)
    detours.push(r)
  }
  if (!detours.length) return null

  // Re-index the combined set so route ids stay unique, then re-classify.
  const combined = [...rawRoutes, ...detours].map((r, index) => ({ ...r, index }))
  return combined
}

/** Probe both sides of the fastest corridor when OSRM returns too few choices. */
async function withDiverseAlternatives(rawRoutes, origin, dest) {
  if (rawRoutes.length >= 3) return rawRoutes
  const fastest = [...rawRoutes].sort((a, b) => a.baseDurationSec - b.baseDurationSec)[0]
  const middle = fastest.geometry[Math.floor(fastest.geometry.length / 2)]
  if (!middle) return rawRoutes

  const candidates = detourWaypoints(fastest.geometry, { lat: middle[1], lng: middle[0] }).slice(0, 4)
  const probes = await Promise.all(candidates.map((via) => fetchRouteVia(origin, via, dest)))
  const seen = new Set(rawRoutes.map(routeSignature))
  const combined = [...rawRoutes]
  for (const route of probes) {
    if (!route) continue
    const signature = routeSignature(route)
    if (seen.has(signature)) continue
    seen.add(signature)
    combined.push(route)
    if (combined.length >= 3) break
  }
  return combined.map((route, index) => ({ ...route, index }))
}

// POST /api/route  { origin:{lat,lng}, dest:{lat,lng} }
router.post('/', async (req, res) => {
  const parsed = routeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const { origin, dest } = parsed.data

  try {
    let rawRoutes = await fetchRoutes(origin, dest)
    rawRoutes = await withDiverseAlternatives(rawRoutes, origin, dest)
    // Only fresh hints (last 24h) influence live routing decisions.
    const hints = listReports({ hours: 24, userId: req.user?.id ?? null })
    const telemetry = listTelemetry({ minutes: 20 })
    let result = classifyRoutes(rawRoutes, hints, telemetry)

    // No clear route among OSRM's own alternatives → try to route around blocks.
    if (result.allBlocked) {
      const combined = await withDetours(rawRoutes, result, origin, dest)
      if (combined) {
        const detoured = classifyRoutes(combined, hints, telemetry)
        // Prefer the detoured answer only if it actually found a way through.
        if (!detoured.allBlocked) result = detoured
      }
    }

    res.json(result)
  } catch (err) {
    res.status(502).json({ error: err.message || 'Routing failed.' })
  }
})

export default router
