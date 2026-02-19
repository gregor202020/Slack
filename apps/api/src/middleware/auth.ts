/**
 * Authentication middleware for Fastify routes.
 *
 * - authenticate: Requires a valid access token (Bearer token in Authorization header).
 * - authenticateOptional: Same but allows unauthenticated access.
 * - requireReauth: Requires a fresh OTP verification within the last 5 minutes.
 */

import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import { db, users, userSessions, otpAttempts } from '@smoker/db'
import { verifyToken, type JwtPayload } from '../lib/jwt.js'
import { sha256 } from '../lib/crypto.js'
import {
  UnauthorizedError,
  ForbiddenError,
  reauthRequiredError,
  userSuspendedError,
  userDeactivatedError,
  tokenRevokedError,
} from '../lib/errors.js'

/**
 * Extend Fastify request to include the authenticated user.
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
}

export interface AuthenticatedUser {
  id: string
  sessionId: string
  orgRole: string
  status: string
}

/**
 * Extract Bearer token from the Authorization header.
 */
function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization
  if (!authHeader) return null

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null

  return parts[1] ?? null
}

/**
 * Fastify preHandler that requires a valid access token.
 *
 * Extracts the access token from the Authorization header (Bearer token),
 * verifies the JWT, checks if the token/session is revoked, checks user status
 * (not suspended/deactivated), and attaches the user to the request.
 */
export const authenticate: preHandlerHookHandler = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const token = extractBearerToken(request)

  if (!token) {
    throw new UnauthorizedError('Missing access token', 'MISSING_TOKEN')
  }

  // Verify JWT signature and expiry
  let payload: JwtPayload
  try {
    payload = verifyToken(token)
  } catch (err) {
    throw err
  }

  // Check if the session is revoked in user_sessions table
  const [session] = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.id, payload.sessionId))
    .limit(1)

  if (!session) {
    throw tokenRevokedError()
  }

  if (session.revokedAt) {
    throw tokenRevokedError()
  }

  // Check if the session has expired
  if (session.expiresAt < new Date()) {
    throw new UnauthorizedError('Session has expired', 'SESSION_EXPIRED')
  }

  // Look up the user and check status
  const [user] = await db
    .select({
      id: users.id,
      orgRole: users.orgRole,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1)

  if (!user) {
    throw new UnauthorizedError('User not found', 'USER_NOT_FOUND')
  }

  if (user.status === 'suspended') {
    throw userSuspendedError()
  }

  if (user.status === 'deactivated') {
    throw userDeactivatedError()
  }

  // Attach user to request
  request.user = {
    id: user.id,
    sessionId: payload.sessionId,
    orgRole: user.orgRole,
    status: user.status,
  }
}

/**
 * Fastify preHandler that optionally authenticates.
 * Does not fail if no token is present — for public endpoints that
 * behave differently when the user is authenticated.
 */
export const authenticateOptional: preHandlerHookHandler = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  const token = extractBearerToken(request)
  if (!token) return

  try {
    const payload = verifyToken(token)

    // Check if the session is revoked
    const [session] = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, payload.sessionId))
      .limit(1)

    if (!session || session.revokedAt) return

    // Check if the session has expired
    if (session.expiresAt < new Date()) return

    // Look up the user and check status
    const [user] = await db
      .select({
        id: users.id,
        orgRole: users.orgRole,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1)

    if (!user) return

    if (user.status === 'suspended' || user.status === 'deactivated') return

    request.user = {
      id: user.id,
      sessionId: payload.sessionId,
      orgRole: user.orgRole,
      status: user.status,
    }
  } catch {
    // Silently ignore token errors for optional auth
  }
}

/**
 * Fastify preHandler that requires a fresh OTP verification within the
 * last 5 minutes. Used for sensitive operations like data export and
 * early vault purge (spec Sections 16.6, 16.7).
 *
 * Must be used AFTER the `authenticate` middleware.
 */
export const requireReauth: preHandlerHookHandler = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  if (!request.user) {
    throw new UnauthorizedError('Authentication required', 'MISSING_TOKEN')
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  // Look up the user's phone number to hash for the OTP attempts query
  const [user] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, request.user.id))
    .limit(1)

  if (!user) {
    throw reauthRequiredError()
  }

  const phoneHash = sha256(user.phone)

  // Find the most recent successful OTP verification
  const [lastSuccess] = await db
    .select({ createdAt: otpAttempts.createdAt })
    .from(otpAttempts)
    .where(
      and(
        eq(otpAttempts.phoneHash, phoneHash),
        eq(otpAttempts.attemptType, 'verify'),
        eq(otpAttempts.success, true),
      ),
    )
    .orderBy(desc(otpAttempts.createdAt))
    .limit(1)

  if (!lastSuccess || lastSuccess.createdAt < fiveMinutesAgo) {
    throw reauthRequiredError()
  }
}
