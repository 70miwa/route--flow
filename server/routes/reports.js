
import { Router } from 'express'
import { z } from 'zod'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()


const reportSchema = z.object({
  lat: z.number().min(5).max(9),
  lng: z.number().min(2).max(5),
  status: z.enum(['blocked', 'slow', 'clear']),
  note: z.string().trim().max(280).optional().default(''),
  road_name: z.string().trim().max(120).optional().default(''),
})

const voteSchema = z.object({
  vote: z.enum(['confirm', 'dispute']),
})

/**
 * Shared data accessor: recent hints with author + vote tallies.
 * Reused by the routing engine to decide which routes are blocked.
 */
export function listReports({ hours = 48, userId = null } = {}) {
  const modifier = `-${Math.max(1, Math.floor(hours))} hours`
  return db
    .prepare(
      `SELECT r.id, r.lat, r.lng, r.road_name, r.status, r.note,
              r.created_at, r.user_id,
              u.username AS author,
              (SELECT COUNT(*) FROM report_votes v
                 WHERE v.report_id = r.id AND v.vote = 'confirm') AS confirms,
              (SELECT COUNT(*) FROM report_votes v
                 WHERE v.report_id = r.id AND v.vote = 'dispute') AS disputes,
              (SELECT v.vote FROM report_votes v
                 WHERE v.report_id = r.id AND v.user_id = ?) AS my_vote
         FROM reports r
         JOIN users u ON u.id = r.user_id
        WHERE r.created_at >= datetime('now', ?)
        ORDER BY r.created_at DESC`
    )
    .all(userId, modifier)
}

// GET /api/reports?hours=48
router.get('/', (req, res) => {
  const hours = Number(req.query.hours) || 48
  const rows = listReports({ hours, userId: req.user?.id ?? null })
  res.json({ reports: rows })
})

// POST /api/reports  (create a hint) — requires auth
router.post('/', requireAuth, (req, res) => {
  const parsed = reportSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const { lat, lng, status, note, road_name } = parsed.data
  const info = db
    .prepare(
      `INSERT INTO reports (user_id, lat, lng, road_name, status, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, lat, lng, road_name || null, status, note || null)

  const [row] = listReports({ hours: 168, userId: req.user.id }).filter(
    (r) => r.id === Number(info.lastInsertRowid)
  )
  res.status(201).json({ report: row })
})

// POST /api/reports/:id/vote  (confirm / dispute) — requires auth
router.post('/:id/vote', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const parsed = voteSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const report = db.prepare('SELECT id FROM reports WHERE id = ?').get(id)
  if (!report) return res.status(404).json({ error: 'Hint not found.' })

  const existing = db
    .prepare('SELECT vote FROM report_votes WHERE report_id = ? AND user_id = ?')
    .get(id, req.user.id)

  if (existing && existing.vote === parsed.data.vote) {
    // Voting the same way again clears the vote (toggle off)
    db.prepare(
      'DELETE FROM report_votes WHERE report_id = ? AND user_id = ?'
    ).run(id, req.user.id)
  } else {
    db.prepare(
      `INSERT INTO report_votes (report_id, user_id, vote)
       VALUES (?, ?, ?)
       ON CONFLICT(report_id, user_id) DO UPDATE SET vote = excluded.vote`
    ).run(id, req.user.id, parsed.data.vote)
  }

  const [row] = listReports({ hours: 168, userId: req.user.id }).filter(
    (r) => r.id === id
  )
  res.json({ report: row })
})

// DELETE /api/reports/:id  (only the author) — requires auth
router.delete('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT user_id FROM reports WHERE id = ?').get(id)
  if (!row) return res.status(404).json({ error: 'Hint not found.' })
  if (row.user_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only remove your own hints.' })
  }
  db.prepare('DELETE FROM reports WHERE id = ?').run(id)
  res.json({ ok: true })
})

export default router
