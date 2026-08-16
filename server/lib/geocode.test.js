import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSearchRows, normalizeReverseResult } from './geocode.js'

test('normalizes Ogun search results into usable address and road labels', () => {
  const [place] = normalizeSearchRows([
    {
      display_name: 'Mokland Hotel, Obantoko, Abeokuta, Ogun, Nigeria',
      lat: '7.1621',
      lon: '3.3482',
      address: {
        road: 'Obantoko Road',
        suburb: 'Obantoko',
        city: 'Abeokuta',
        state: 'Ogun',
      },
    },
  ])

  assert.deepEqual(place, {
    label: 'Mokland Hotel, Obantoko, Abeokuta, Ogun, Nigeria',
    lat: 7.1621,
    lng: 3.3482,
    road: 'Obantoko Road',
    area: 'Obantoko, Abeokuta',
  })
})

test('normalizes reverse geocoding into a full address with road context', () => {
  const result = normalizeReverseResult({
    display_name: '12 Unity Street, Ibara, Abeokuta, Ogun, Nigeria',
    address: {
      house_number: '12',
      road: 'Unity Street',
      neighbourhood: 'Ibara',
      city: 'Abeokuta',
      state: 'Ogun',
    },
  })

  assert.deepEqual(result, {
    label: '12 Unity Street, Ibara, Abeokuta, Ogun, Nigeria',
    road: 'Unity Street',
    area: 'Ibara, Abeokuta',
  })
})
