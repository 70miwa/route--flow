import jwt from 'jsonwebtoken'
import { JWT_SECRET, COOKIE_NAME } from '../config.js'

/**
 * Reads the JWT from the httpOnly cookie and attaches req.user if valid.
 * Never throws — leaves req.user null when there's no/invalid token.
 */
export function attachUser(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  req.user = null
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET)
      req.user = { id: payload.sub, username: payload.username }
    } catch {
      // invalid/expired token — treated as anonymous
    }
  }
  next()
}

/** Guard for routes that require a signed-in user. */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'You must be signed in to do that.' })
  }
  next()
}
