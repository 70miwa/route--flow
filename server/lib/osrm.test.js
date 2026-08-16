import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeOsrmRoute } from './osrm.js'

test('normalizes named road steps without duplicating adjacent names', () => {
  const route = normalizeOsrmRoute({
    geometry: { coordinates: [[3, 7], [3.1, 7]] },
    distance: 12_500,
    duration: 900,
    legs: [{
      steps: [
        { name: 'Lagos-Abeokuta Expressway', ref: 'A5' },
        { name: 'Lagos-Abeokuta Expressway', ref: 'A5' },
        { name: 'Kuto Road', ref: null },
      ],
    }],
  }, 0)

  assert.equal(route.distanceMeters, 12_500)
  assert.deepEqual(route.roadNames, ['Lagos-Abeokuta Expressway (A5)', 'Kuto Road'])
})
