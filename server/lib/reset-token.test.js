import test from 'node:test'
import assert from 'node:assert/strict'
import { createResetToken, hashResetToken, isResetTokenCurrent } from './reset-token.js'

test('reset tokens are high-entropy, one-way values', () => {
  const first = createResetToken()
  const second = createResetToken()
  assert.match(first.value, /^[a-f0-9]{64}$/)
  assert.match(first.hash, /^[a-f0-9]{64}$/)
  assert.notEqual(first.value, second.value)
  assert.notEqual(first.value, first.hash)
  assert.equal(hashResetToken(first.value), first.hash)
})

test('reset-token expiry is strict and deterministic', () => {
  const now = Date.parse('2026-08-16T12:00:00.000Z')
  assert.equal(isResetTokenCurrent('2026-08-16T12:30:00.000Z', now), true)
  assert.equal(isResetTokenCurrent('2026-08-16T12:00:00.000Z', now), false)
  assert.equal(isResetTokenCurrent('not-a-date', now), false)
})
