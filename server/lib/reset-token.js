import { createHash, randomBytes } from 'node:crypto'

/** Create a raw token for delivery and the only form that should be persisted. */
export function createResetToken() {
  const value = randomBytes(32).toString('hex')
  return { value, hash: hashResetToken(value) }
}

export function hashResetToken(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function isResetTokenCurrent(expiresAt, now = Date.now()) {
  const expiry = new Date(expiresAt).getTime()
  return Number.isFinite(expiry) && expiry > now
}
