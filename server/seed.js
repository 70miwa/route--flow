import bcrypt from 'bcryptjs'
import db from './db.js'

/**
 * Seeds two demo users and a spread of realistic road hints across known
 * Ogun State corridors so Route-Flow demonstrates immediately.
 * Safe to run repeatedly: it only inserts hints when none exist yet.
 */
async function ensureUser(username, email, password) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) return existing.id
  const hash = await bcrypt.hash(password, 10)
  const info = db
    .prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    )
    .run(username, email, hash)
  return Number(info.lastInsertRowid)
}

async function main() {
  const demoId = await ensureUser('demo', 'demo@routeflow.ng', 'password123')
  const adaId = await ensureUser('ada_ogun', 'ada@routeflow.ng', 'password123')

  const count = db.prepare('SELECT COUNT(*) AS n FROM reports').get().n
  if (count > 0) {
    console.log(`[seed] reports already present (${count}); skipping hint seed.`)
    console.log('[seed] Demo login -> email: demo@routeflow.ng  password: password123')
    return
  }

  const hints = [
    {
      user_id: demoId,
      lat: 6.6975, lng: 3.2436,
      road_name: 'Lagos–Abeokuta Expressway (Sango-Ota)',
      status: 'blocked',
      note: 'Tanker fell across the road near Sango bridge — total gridlock.',
    },
    {
      user_id: adaId,
      lat: 6.8149, lng: 3.1975,
      road_name: 'Lagos–Abeokuta Expressway (Ifo)',
      status: 'slow',
      note: 'Market day, heavy but still moving.',
    },
    {
      user_id: demoId,
      lat: 7.17, lng: 3.36,
      road_name: 'Abeokuta–Ibadan Road',
      status: 'clear',
      note: 'Free flow this morning.',
    },
    {
      user_id: adaId,
      lat: 6.83, lng: 3.64,
      road_name: 'Lagos–Ibadan Expressway (Sagamu Interchange)',
      status: 'slow',
      note: 'Roadworks — one lane closed, expect delays.',
    },
    {
      user_id: demoId,
      lat: 6.79, lng: 3.9,
      road_name: 'Sagamu–Ore Expressway',
      status: 'blocked',
      note: 'Flooded after heavy rain, vehicles turning back.',
    },
    {
      user_id: adaId,
      lat: 6.8203, lng: 3.9179,
      road_name: 'Ijebu-Ode Roundabout',
      status: 'clear',
      note: 'Smooth, no hold-up.',
    },
    {
      user_id: demoId,
      lat: 6.7, lng: 3.2,
      road_name: 'Sango–Idiroko Road',
      status: 'slow',
      note: 'Police checkpoint slowing traffic.',
    },
  ]

  const insert = db.prepare(
    `INSERT INTO reports (user_id, lat, lng, road_name, status, note)
     VALUES (@user_id, @lat, @lng, @road_name, @status, @note)`
  )
  const ids = []
  const tx = db.transaction((rows) => {
    for (const r of rows) ids.push(Number(insert.run(r).lastInsertRowid))
  })
  tx(hints)

  // A couple of cross-confirmations to show the voting/confidence mechanic.
  const vote = db.prepare(
    `INSERT INTO report_votes (report_id, user_id, vote) VALUES (?, ?, ?)
     ON CONFLICT(report_id, user_id) DO UPDATE SET vote = excluded.vote`
  )
  vote.run(ids[0], adaId, 'confirm') // second driver confirms the Sango tanker block
  vote.run(ids[4], demoId, 'confirm') // confirms the flooded Sagamu–Ore road

  console.log(`[seed] inserted ${ids.length} hints across Ogun State corridors.`)
  console.log('[seed] Demo login -> email: demo@routeflow.ng  password: password123')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed:', err)
    process.exit(1)
  })
