import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createServer } from 'node:http'
import routingRoutes from './routing.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('route endpoint returns a ranked, traffic-aware response from OSRM data', async () => {
  const osrmResponse = {
    code: 'Ok',
    routes: [
      {
        geometry: {
          type: 'LineString',
          coordinates: [[3, 7], [3.05, 7], [3.1, 7]],
        },
        distance: 10_000,
        duration: 600,
      },
    ],
  }

  globalThis.fetch = async (url) => {
    if (String(url).includes('/route/v1/driving/')) {
      return new Response(JSON.stringify(osrmResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return originalFetch(url)
  }

  const app = express()
  app.use(express.json())
  app.use('/api/route', routingRoutes)
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  try {
    const response = await originalFetch(`http://127.0.0.1:${port}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { lat: 7, lng: 3 },
        dest: { lat: 7, lng: 3.1 },
      }),
    })
    const result = await response.json()

    assert.equal(response.status, 200)
    assert.equal(result.recommendedId, 'r0')
    assert.equal(result.routes[0].travelable, true)
    assert.equal(result.routes[0].distanceKm, 10)
    assert.equal(typeof result.routes[0].adjustedEtaMin, 'number')
    assert.equal(typeof result.advice, 'string')
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
