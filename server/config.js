import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

export const PORT = Number(process.env.PORT) || 3000
export const NODE_ENV = process.env.NODE_ENV || 'development'
export const IS_PROD = NODE_ENV === 'production'
export const JWT_SECRET =
  process.env.JWT_SECRET || 'route-flow-dev-secret-change-me'
export const JWT_EXPIRES_IN = '7d'
export const COOKIE_NAME = 'rf_token'
export const APP_URL = process.env.APP_URL || 'http://localhost:5173'
export const RESET_TOKEN_TTL_MINUTES = 30

// Optional transactional-email configuration. In development Route-Flow logs
// the reset link instead, so the full recovery flow remains testable locally.
export const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
export const RESET_FROM_EMAIL =
  process.env.RESET_FROM_EMAIL || 'Route-Flow <no-reply@routeflow.ng>'

// Free external services (no key required)
export const OSRM_URL =
  process.env.OSRM_URL || 'https://router.project-osrm.org'
export const NOMINATIM_URL =
  process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org'

if (JWT_SECRET === 'route-flow-dev-secret-change-me' && IS_PROD) {
  console.warn(
    '[route-flow] WARNING: using the default JWT secret in production. Set JWT_SECRET in .env!'
  )
}
