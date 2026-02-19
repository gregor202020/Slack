/**
 * Auth helpers for test suites.
 *
 * Generates valid JWT access and refresh tokens for test users,
 * using the same signing logic as the real app.
 */

import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'

/**
 * Generate a signed access token for a test user.
 * Matches the shape produced by signAccessToken in src/lib/jwt.ts.
 */
export function generateTestToken(
  userId: string,
  sessionId: string = 'test-session-id',
): string {
  return jwt.sign(
    {
      userId,
      sessionId,
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: '15m',
      jwtid: randomBytes(16).toString('hex'),
      subject: userId,
    },
  )
}

/**
 * Generate a signed refresh token for a test user.
 * Matches the shape produced by signRefreshToken in src/lib/jwt.ts.
 */
export function generateTestRefreshToken(
  userId: string,
  sessionId: string = 'test-session-id',
): string {
  return jwt.sign(
    {
      userId,
      sessionId,
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: '7d',
      jwtid: randomBytes(16).toString('hex'),
      subject: userId,
    },
  )
}

/**
 * Generate an expired access token (useful for testing token expiry).
 */
export function generateExpiredToken(
  userId: string,
  sessionId: string = 'test-session-id',
): string {
  return jwt.sign(
    {
      userId,
      sessionId,
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: '0s',
      jwtid: randomBytes(16).toString('hex'),
      subject: userId,
    },
  )
}

/**
 * Generate a token signed with a different secret (invalid signature).
 */
export function generateInvalidToken(
  userId: string,
  sessionId: string = 'test-session-id',
): string {
  return jwt.sign(
    {
      userId,
      sessionId,
    },
    'wrong-secret-key',
    {
      expiresIn: '15m',
      jwtid: randomBytes(16).toString('hex'),
      subject: userId,
    },
  )
}
