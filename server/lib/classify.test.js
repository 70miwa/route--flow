import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyRoutes, detourWaypoints, reportConfidence, telemetryDelay, annotateRoute } from './classify.js'
import { lineString } from '@turf/turf'

const now = new Date().toISOString()
const routes = [
  {
    index: 0,
    geometry: [
      [3, 7],
      [3.1, 7],
    ],
    distanceMeters: 12_000,
    baseDurationSec: 20 * 60,
  },
  {
    index: 1,
    geometry: [
      [3, 7.01],
      [3.1, 7.01],
    ],
    distanceMeters: 13_500,
    baseDurationSec: 22 * 60,
  },
]

function report(id, status, lng = 3.05) {
  return {
    id,
    lat: 7,
    lng,
    status,
    confirms: 0,
    disputes: 0,
    created_at: now,
    road_name: 'Test Road',
    note: null,
  }
}

test('keeps the usual route when an alternative does not save meaningful time', () => {
  const result = classifyRoutes(routes, [report(1, 'slow')])
  assert.equal(result.recommendedId, 'r0')
  assert.equal(result.rerouted, false)
  assert.match(result.advice, /alternatives would take longer|usual route remains/)
})

test('recommends an alternative only when adjusted ETA produces a real saving', () => {
  const result = classifyRoutes(routes, [
    report(1, 'slow', 3.03),
    report(2, 'slow', 3.05),
    report(3, 'slow', 3.07),
  ])
  assert.equal(result.recommendedId, 'r1')
  assert.equal(result.rerouted, true)
  assert.ok(result.timeSavedMin >= 2)
})

test('moves away from a credibly blocked default route', () => {
  const blocked = { ...report(1, 'blocked'), confirms: 2 }
  const result = classifyRoutes(routes, [blocked])
  assert.equal(result.defaultBlocked, true)
  assert.equal(result.recommendedId, 'r1')
  assert.equal(result.routes.find((route) => route.id === 'r0').travelable, false)
})

test('fresh reports have confidence while stale reports fade out', () => {
  const fresh = reportConfidence(report(10, 'slow'))
  const stale = reportConfidence({ ...report(11, 'slow'), created_at: '2020-01-01T00:00:00.000Z' })
  assert.ok(fresh > 0.45 && fresh <= 1)
  assert.equal(stale, 0)
})

test('telemetry only affects a nearby route and adds delay for slower observed speed', () => {
  const route = routes[0]
  const line = lineString(route.geometry)
  const nearby = telemetryDelay(line, route, [{
    lat: 7,
    lng: 3.05,
    speed_kph: 8,
    accuracy_m: 15,
    recorded_at: new Date().toISOString(),
  }])
  const farAway = telemetryDelay(line, route, [{
    lat: 7.2,
    lng: 3.05,
    speed_kph: 8,
    accuracy_m: 15,
    recorded_at: new Date().toISOString(),
  }])

  assert.ok(nearby.telemetryDelayMin > 0)
  assert.equal(nearby.telemetrySamples, 1)
  assert.equal(farAway.telemetryDelayMin, 0)
  assert.equal(farAway.telemetrySamples, 0)
})

test('a route with modest telemetry remains travelable but is classified as slow when delay is material', () => {
  const annotated = annotateRoute(routes[0], [], [
    { lat: 7, lng: 3.01, speed_kph: 4, accuracy_m: 10, recorded_at: new Date().toISOString() },
    { lat: 7, lng: 3.04, speed_kph: 4, accuracy_m: 10, recorded_at: new Date().toISOString() },
    { lat: 7, lng: 3.07, speed_kph: 4, accuracy_m: 10, recorded_at: new Date().toISOString() },
  ])
  assert.equal(annotated.travelable, true)
  assert.equal(annotated.status, 'slow')
  assert.ok(annotated.adjustedEtaMin > annotated.baseEtaMin)
})

test('detour probes are generated on both sides of a blocked corridor', () => {
  const waypoints = detourWaypoints(routes[0].geometry, { lat: 7, lng: 3.05 })
  assert.equal(waypoints.length, 4)
  assert.ok(waypoints.every((point) => point.lat >= 5 && point.lat <= 9 && point.lng >= 2 && point.lng <= 5))
})
