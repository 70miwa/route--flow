import express from 'express'
import cookieParser from 'cookie-parser'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

import { PORT, IS_PROD } from './config.js'
import { attachUser } from './middleware/auth.js'
import authRoutes from './routes/auth.js'
import reportRoutes from './routes/reports.js'
import routingRoutes from './routes/routing.js'
import telemetryRoutes from './routes/telemetry.js'
import geocodingRoutes from './routes/geocoding.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(express.json({ limit: '256kb' }))
app.use(cookieParser())
app.use(attachUser)

// --- API ---
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'route-flow' }))
app.use('/api/auth', authRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/route', routingRoutes)
app.use('/api/telemetry', telemetryRoutes)
app.use('/api/geocode', geocodingRoutes)

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }))

// --- Serve built client in production (single-origin) ---
const distDir = join(__dirname, '..', 'client', 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  // SPA fallback for client-side routing / direct loads
  app.get('*', (_req, res) => res.sendFile(join(distDir, 'index.html')))
} else {
  app.get('/', (_req, res) =>
    res
      .type('text')
      .send(
        'Route-Flow API is running.\n' +
          'In development, open the Vite dev server at http://localhost:5173\n' +
          'For production, run `npm run build` then `npm start`.'
      )
  )
}

// Central error handler
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' })
  }
  console.error('[route-flow] unhandled error:', err)
  res.status(500).json({ error: 'Something went wrong on the server.' })
})

app.listen(PORT, () => {
  console.log(
    `[route-flow] server listening on http://localhost:${PORT} (${
      IS_PROD ? 'production' : 'development'
    })`
  )
})
