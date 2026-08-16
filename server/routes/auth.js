import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import db from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  COOKIE_NAME,
  IS_PROD,
  APP_URL,
  RESET_TOKEN_TTL_MINUTES,
  RESEND_API_KEY,
  RESET_FROM_EMAIL,
} from '../config.js'
import { createResetToken, hashResetToken } from '../lib/reset-token.js'

const router = Router()

const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username must be at most 24 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Use only letters, numbers and underscores'),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200),
})

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

const requestResetSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
})

const resetPasswordSchema = z.object({
  token: z.string().min(32, 'Enter the reset token from your email').max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

async function sendResetEmail(email, token) {
  const resetUrl = `${APP_URL}/?resetToken=${encodeURIComponent(token)}`
  if (!RESEND_API_KEY) {
    console.info(`[route-flow] password reset for ${email}: ${resetUrl}`)
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESET_FROM_EMAIL,
      to: [email],
      subject: 'Reset your Route-Flow password',
      text:
        `Use this token to reset your Route-Flow password:\n\n${token}\n\n` +
        `Or open ${resetUrl}\n\nThis token expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
    }),
  })

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}`)
  }
}

function issueCookie(res, user) {
  const token = jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  })
}

function publicUser(row) {
  return { id: row.id, username: row.username, email: row.email }
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const { username, email, password } = parsed.data

  const existing = db
    .prepare('SELECT id FROM users WHERE email = ? OR username = ?')
    .get(email, username)
  if (existing) {
    return res
      .status(409)
      .json({ error: 'That email or username is already taken.' })
  }

  const password_hash = await bcrypt.hash(password, 10)
  const info = db
    .prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    )
    .run(username, email, password_hash)

  const user = { id: info.lastInsertRowid, username, email }
  issueCookie(res, user)
  res.status(201).json({ user: publicUser(user) })
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }
  const { email, password } = parsed.data

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  // Generic message to avoid user enumeration
  const invalid = () =>
    res.status(401).json({ error: 'Invalid email or password.' })
  if (!row) return invalid()

  const ok = await bcrypt.compare(password, row.password_hash)
  if (!ok) return invalid()

  issueCookie(res, row)
  res.json({ user: publicUser(row) })
})

// POST /api/auth/request-reset
router.post('/request-reset', async (req, res) => {
  const parsed = requestResetSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  const row = db.prepare('SELECT id, email FROM users WHERE email = ?').get(parsed.data.email)
  let devToken
  if (row) {
    const { value: token, hash: tokenHash } = createResetToken()
    const expiresModifier = `+${RESET_TOKEN_TTL_MINUTES} minutes`

    db.transaction(() => {
      db.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= datetime('now')").run()
      db.prepare(
        'UPDATE password_reset_tokens SET used_at = datetime(\'now\') WHERE user_id = ? AND used_at IS NULL'
      ).run(row.id)
      db.prepare(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, datetime('now', ?))`
      ).run(row.id, tokenHash, expiresModifier)
    })()

    try {
      await sendResetEmail(row.email, token)
      if (!IS_PROD && !RESEND_API_KEY) devToken = token
    } catch (error) {
      console.error('[route-flow] reset email failed:', error)
    }
  }

  res.json({
    ok: true,
    message: 'If that email is registered, a reset token has been sent.',
    ...(devToken ? { devToken } : {}),
  })
})

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  const tokenHash = hashResetToken(parsed.data.token)
  const reset = db
    .prepare(
      `SELECT id, user_id
         FROM password_reset_tokens
        WHERE token_hash = ?
          AND used_at IS NULL
          AND expires_at > datetime('now')`
    )
    .get(tokenHash)

  if (!reset) {
    return res.status(400).json({ error: 'That reset token is invalid or has expired.' })
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, reset.user_id)
    db.prepare(
      "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL"
    ).run(reset.user_id)
  })()

  res.json({ ok: true, message: 'Password updated. You can now sign in.' })
})

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' })
  res.json({ ok: true })
})

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT id, username, email FROM users WHERE id = ?')
    .get(req.user.id)
  if (!row) return res.status(404).json({ error: 'User not found.' })
  res.json({ user: publicUser(row) })
})

export default router
