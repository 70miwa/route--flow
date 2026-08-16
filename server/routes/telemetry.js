

import { Router } from 'express'
import { z } from 'zod'
import db from '../db.js'

const router = Router()

const telemetrySchema = z.object({
  lat: z.number().min(5).max(9),
  lng: z.number().min(2).max(5),
  speed_kph: z.number().min(0).max(160),
  accuracy_m: z.number().min(0).max(250).optional(),
  heading_deg: z.number().min(0).max(360).optional(),
})

/**
 * Save an opt-in, short-retention location-speed observation. These samples are
 * deliberately not exposed as a user history; routing only reads an aggregate
 * of recent nearby speeds.
 */
router.post('/', (req, res) => {
  const parsed = telemetrySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  const { lat, lng, speed_kph, accuracy_m, heading_deg } = parsed.data
  db.prepare(
    `INSERT INTO telemetry_samples
       (user_id, lat, lng, speed_kph, accuracy_m, heading_deg)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.user?.id ?? null, lat, lng, speed_kph, accuracy_m ?? null, heading_deg ?? null)

  // Keep the operational data set bounded and privacy-preserving.
  db.prepare("DELETE FROM telemetry_samples WHERE recorded_at < datetime('now', '-2 hours')").run()

  res.status(202).json({ ok: true })
})

export function listTelemetry({ minutes = 20 } = {}) {
  const modifier = `-${Math.max(1, Math.min(120, Math.floor(minutes)))} minutes`
  return db
    .prepare(
      `SELECT id, lat, lng, speed_kph, accuracy_m, heading_deg, recorded_at
         FROM telemetry_samples
        WHERE recorded_at >= datetime('now', ?)
          AND (accuracy_m IS NULL OR accuracy_m <= 100)
        ORDER BY recorded_at DESC
        LIMIT 400`
    )
    .all(modifier)
}

export default router
