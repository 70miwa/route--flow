import { Router } from 'express'
import { z } from 'zod'
import { NOMINATIM_URL } from '../config.js'
import { normalizeReverseResult, normalizeSearchRows } from '../lib/geocode.js'

const router = Router()
const searchSchema = z.object({ q: z.string().trim().min(2).max(120) })
const reverseSchema = z.object({
  lat: z.coerce.number().min(5).max(9),
  lng: z.coerce.number().min(2).max(5),
})
const cache = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000
let nominatimQueue = Promise.resolve()
let lastRequestAt = 0

function cached(key) {
  const item = cache.get(key)
  if (!item || Date.now() - item.createdAt > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return item.value
}

function store(key, value) {
  cache.set(key, { createdAt: Date.now(), value })
  if (cache.size > 500) cache.delete(cache.keys().next().value)
  return value
}

function nominatim(path, params) {
  const task = async () => {
    const waitMs = Math.max(0, 1050 - (Date.now() - lastRequestAt))
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs))
    lastRequestAt = Date.now()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)
    try {
      const response = await fetch(`${NOMINATIM_URL}${path}?${params}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en',
          'User-Agent': 'Route-Flow/1.0 (Ogun State routing application)',
        },
      })
      if (!response.ok) throw new Error(`Geocoding service returned ${response.status}`)
      return response.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  const result = nominatimQueue.then(task, task)
  nominatimQueue = result.catch(() => undefined)
  return result
}

// GET /api/geocode/search?q=...
router.get('/search', async (req, res) => {
  const parsed = searchSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const query = parsed.data.q
  const key = `search:${query.toLowerCase()}`
  const existing = cached(key)
  if (existing) return res.json({ places: existing })

  try {
    const params = new URLSearchParams({
      q: /ogun/i.test(query) ? query : `${query}, Ogun State, Nigeria`,
      format: 'jsonv2',
      limit: '8',
      addressdetails: '1',
      countrycodes: 'ng',
      viewbox: '2.55,8.05,4.75,6.15',
      bounded: '1',
    })
    const places = normalizeSearchRows(await nominatim('/search', params))
    res.json({ places: store(key, places) })
  } catch (error) {
    res.status(502).json({ error: error.name === 'AbortError' ? 'Address search timed out.' : 'Address search is temporarily unavailable.' })
  }
})

// GET /api/geocode/reverse?lat=...&lng=...
router.get('/reverse', async (req, res) => {
  const parsed = reverseSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  const { lat, lng } = parsed.data
  const key = `reverse:${lat.toFixed(4)},${lng.toFixed(4)}`
  const existing = cached(key)
  if (existing) return res.json({ place: existing })

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
      zoom: '18',
      addressdetails: '1',
    })
    const place = normalizeReverseResult(await nominatim('/reverse', params))
    res.json({ place: store(key, place) })
  } catch (error) {
    res.status(502).json({ error: error.name === 'AbortError' ? 'Address lookup timed out.' : 'Address lookup is temporarily unavailable.' })
  }
})

export default router
