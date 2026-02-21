/**
 * Unit tests for JWT utilities.
 *
 * Tests:
 *   - signAccessToken: Access token creation
 *   - signRefreshToken: Refresh token creation
 *   - verifyToken: Token verification, expiry, and error handling
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import jwt from 'jsonwebtoken'

// Ensure config is loaded before JWT module uses it
import { loadConfig } from '../../../src/lib/config.js'

import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from '../../../src/lib/jwt.js'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  loadConfig()
})

// ---------------------------------------------------------------------------
// signAccessToken
// ---------------------------------------------------------------------------

describe('JWT — signAccessToken', () => {
  it('should return a JWT string with three dot-separated parts', () => {
    const token = signAccessToken({ userId: 'user-1', sessionId: 'session-1' })

    const parts = token.split('.')
    expect(parts).toHaveLength(3)
  })

  it('should create a token that can be verified', () => {
    const token = signAccessToken({ userId: 'user-1', sessionId: 'session-1' })
    const payload = verifyToken(token)

    expect(payload.userId).toBe('user-1')
    expect(payload.sessionId).toBe('session-1')
  })

  it('should include iat, exp, and jti in the payload', () => {
    const token = signAccessToken({ userId: 'user-1', sessionId: 'session-1' })
    const payload = verifyToken(token)

    expect(payload.iat).toBeTypeOf('number')
    expect(payload.exp).toBeTypeOf('number')
    expect(payload.jti).toBeTypeOf('string')
    expect(payload.jti).toHaveLength(32) // 16 bytes = 32 hex chars
  })

  it('should set expiry based on config jwtAccessExpiry', () => {
    const token = signAccessToken({ userId: 'user-1', sessionId: 'session-1' })
    const payload = verifyToken(token)

    // Default access expiry is 900 seconds (15 minutes)
    const expectedExpiry = payload.iat + 900
    expect(payload.exp).toBe(expectedExpiry)
  })

  it('should generate unique jti for each token', () => {
    const token1 = signAccessToken({ userId: 'user-1', sessionId: 'session-1' })
    const token2 = signAccessToken({ userId: 'user-1', sessionId: 'session-1' })

    const payload1 = verifyToken(token1)
    const payload2 = verifyToken(token2)

    expect(payload1.jti).not.toBe(payload2.jti)
  })
})

// ---------------------------------------------------------------------------
// signRefreshToken
// ---------------------------------------------------------------------------

describe('JWT — signRefreshToken', () => {
  it('should return a JWT string', () => {
    const token = signRefreshToken({ userId: 'user-1', sessionId: 'session-1' })

    const parts = token.split('.')
    expect(parts).toHaveLength(3)
  })

  it('should create a token with longer expiry than access token', () => {
    const accessToken = signAccessToken({ userId: 'user-1', sessionId: 'session-1' })
    const refreshToken = signRefreshToken({ userId: 'user-1', sessionId: 'session-1' })

    const accessPayload = verifyToken(accessToken)
    const refreshPayload = verifyToken(refreshToken)

    const accessTtl = accessPayload.exp - accessPayload.iat
    const refreshTtl = refreshPayload.exp - refreshPayload.iat

    expect(refreshTtl).toBeGreaterThan(accessTtl)
  })

  it('should set expiry based on config jwtRefreshExpiry', () => {
    const token = signRefreshToken({ userId: 'user-1', sessionId: 'session-1' })
    const payload = verifyToken(token)

    // Default refresh expiry is 604800 seconds (7 days)
    const expectedExpiry = payload.iat + 604800
    expect(payload.exp).toBe(expectedExpiry)
  })
})

// ---------------------------------------------------------------------------
// verifyToken
// ---------------------------------------------------------------------------

describe('JWT — verifyToken', () => {
  it('should return the full payload for a valid token', () => {
    const token = signAccessToken({ userId: 'user-42', sessionId: 'session-99' })
    const payload = verifyToken(token)

    expect(payload.userId).toBe('user-42')
    expect(payload.sessionId).toBe('session-99')
    expect(payload.iat).toBeTypeOf('number')
    expect(payload.exp).toBeTypeOf('number')
    expect(payload.jti).toBeTypeOf('string')
  })

  it('should throw TOKEN_EXPIRED for an expired token', () => {
    // Create a token that is already expired by using jsonwebtoken directly
    const config = loadConfig()

    const token = jwt.sign(
      { userId: 'user-1', sessionId: 'session-1' },
      config.jwtSecret,
      { expiresIn: -10 }, // already expired
    )

    expect(() => verifyToken(token)).toThrow('Token has expired')
  })

  it('should throw INVALID_TOKEN for a tampered token', () => {
    const token = signAccessToken({ userId: 'user-1', sessionId: 'session-1' })

    // Tamper with the payload
    const parts = token.split('.')
    parts[1] = parts[1]! + 'tampered'
    const tamperedToken = parts.join('.')

    expect(() => verifyToken(tamperedToken)).toThrow('Invalid token')
  })

  it('should throw INVALID_TOKEN for a completely invalid string', () => {
    expect(() => verifyToken('not-a-jwt')).toThrow('Invalid token')
  })

  it('should throw INVALID_TOKEN for a token signed with wrong secret', () => {
    const token = jwt.sign(
      { userId: 'user-1', sessionId: 'session-1' },
      'wrong-secret',
      { expiresIn: 900 },
    )

    expect(() => verifyToken(token)).toThrow('Invalid token')
  })
})
