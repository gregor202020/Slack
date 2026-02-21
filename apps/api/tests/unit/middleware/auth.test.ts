/**
 * Unit tests for auth middleware.
 *
 * Tests the authenticate and requireReauth preHandlers:
 *   - Bearer token extraction
 *   - JWT verification
 *   - Session/user status checks
 *   - Reauth OTP freshness check
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('../../../src/lib/jwt.js', () => ({
  verifyToken: vi.fn(),
}))

vi.mock('../../../src/lib/crypto.js', () => ({
  sha256: vi.fn((input: string) => `hashed_${input}`),
}))

vi.mock('@smoker/db', () => {
  const selectFn = vi.fn()
  const fromFn = vi.fn()
  const whereFn = vi.fn()
  const limitFn = vi.fn()
  const orderByFn = vi.fn()

  const chainMock = {
    select: selectFn.mockReturnThis(),
    from: fromFn.mockReturnThis(),
    where: whereFn.mockReturnThis(),
    limit: limitFn.mockResolvedValue([]),
    orderBy: orderByFn.mockReturnThis(),
  }

  // Make limit also available after orderBy
  orderByFn.mockReturnValue({ limit: limitFn })

  return {
    db: chainMock,
    users: { id: 'id', orgRole: 'orgRole', status: 'status', phone: 'phone' },
    userSessions: { id: 'id', revokedAt: 'revokedAt', expiresAt: 'expiresAt' },
    otpAttempts: { phoneHash: 'phoneHash', attemptType: 'attemptType', success: 'success', createdAt: 'createdAt' },
  }
})

import { authenticate, requireReauth } from '../../../src/middleware/auth.js'
import { verifyToken } from '../../../src/lib/jwt.js'
import { db } from '@smoker/db'
import type { FastifyRequest, FastifyReply } from 'fastify'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    headers: {},
    ...overrides,
  } as unknown as FastifyRequest
}

const mockReply = {} as FastifyReply

// ---------------------------------------------------------------------------
// authenticate
// ---------------------------------------------------------------------------

describe('Auth Middleware — authenticate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw MISSING_TOKEN when no Authorization header is present', async () => {
    const request = mockRequest({ headers: {} })

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'Missing access token',
    )
  })

  it('should throw MISSING_TOKEN when Authorization header is not Bearer', async () => {
    const request = mockRequest({
      headers: { authorization: 'Basic abc123' },
    })

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'Missing access token',
    )
  })

  it('should throw MISSING_TOKEN when Bearer token is empty', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer' },
    })

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'Missing access token',
    )
  })

  it('should rethrow JWT verification errors', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer invalid-token' },
    })

    vi.mocked(verifyToken).mockImplementation(() => {
      throw new Error('Invalid token')
    })

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'Invalid token',
    )
  })

  it('should throw TOKEN_REVOKED when session is not found', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer valid-token' },
    })

    vi.mocked(verifyToken).mockReturnValue({
      userId: 'user-1',
      sessionId: 'session-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      jti: 'jti-1',
    })

    // First limit call returns no session
    vi.mocked(db.limit).mockResolvedValueOnce([])

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'Token has been revoked',
    )
  })

  it('should throw TOKEN_REVOKED when session is revoked', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer valid-token' },
    })

    vi.mocked(verifyToken).mockReturnValue({
      userId: 'user-1',
      sessionId: 'session-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      jti: 'jti-1',
    })

    // Session exists but is revoked
    vi.mocked(db.limit).mockResolvedValueOnce([
      { id: 'session-1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 86400000) },
    ])

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'Token has been revoked',
    )
  })

  it('should throw SESSION_EXPIRED when session has expired', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer valid-token' },
    })

    vi.mocked(verifyToken).mockReturnValue({
      userId: 'user-1',
      sessionId: 'session-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      jti: 'jti-1',
    })

    // Session exists but expired
    vi.mocked(db.limit).mockResolvedValueOnce([
      { id: 'session-1', revokedAt: null, expiresAt: new Date(Date.now() - 1000) },
    ])

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'Session has expired',
    )
  })

  it('should throw USER_NOT_FOUND when user does not exist', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer valid-token' },
    })

    vi.mocked(verifyToken).mockReturnValue({
      userId: 'user-1',
      sessionId: 'session-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      jti: 'jti-1',
    })

    // Session is valid
    vi.mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'session-1', revokedAt: null, expiresAt: new Date(Date.now() + 86400000) },
      ])
      // User not found
      .mockResolvedValueOnce([])

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'User not found',
    )
  })

  it('should throw USER_SUSPENDED when user is suspended', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer valid-token' },
    })

    vi.mocked(verifyToken).mockReturnValue({
      userId: 'user-1',
      sessionId: 'session-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      jti: 'jti-1',
    })

    vi.mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'session-1', revokedAt: null, expiresAt: new Date(Date.now() + 86400000) },
      ])
      .mockResolvedValueOnce([
        { id: 'user-1', orgRole: 'basic', status: 'suspended' },
      ])

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'User account is suspended',
    )
  })

  it('should throw USER_DEACTIVATED when user is deactivated', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer valid-token' },
    })

    vi.mocked(verifyToken).mockReturnValue({
      userId: 'user-1',
      sessionId: 'session-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      jti: 'jti-1',
    })

    vi.mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'session-1', revokedAt: null, expiresAt: new Date(Date.now() + 86400000) },
      ])
      .mockResolvedValueOnce([
        { id: 'user-1', orgRole: 'basic', status: 'deactivated' },
      ])

    await expect(authenticate(request, mockReply, vi.fn())).rejects.toThrow(
      'User account is deactivated',
    )
  })

  it('should attach user to request when authentication succeeds', async () => {
    const request = mockRequest({
      headers: { authorization: 'Bearer valid-token' },
    })

    vi.mocked(verifyToken).mockReturnValue({
      userId: 'user-1',
      sessionId: 'session-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      jti: 'jti-1',
    })

    vi.mocked(db.limit)
      .mockResolvedValueOnce([
        { id: 'session-1', revokedAt: null, expiresAt: new Date(Date.now() + 86400000) },
      ])
      .mockResolvedValueOnce([
        { id: 'user-1', orgRole: 'admin', status: 'active' },
      ])

    await authenticate(request, mockReply, vi.fn())

    expect(request.user).toEqual({
      id: 'user-1',
      sessionId: 'session-1',
      orgRole: 'admin',
      status: 'active',
    })
  })
})

// ---------------------------------------------------------------------------
// requireReauth
// ---------------------------------------------------------------------------

describe('Auth Middleware — requireReauth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should throw when request.user is not set', async () => {
    const request = mockRequest()

    await expect(requireReauth(request, mockReply, vi.fn())).rejects.toThrow(
      'Authentication required',
    )
  })

  it('should throw REAUTH_REQUIRED when user is not found in DB', async () => {
    const request = mockRequest()
    request.user = { id: 'user-1', sessionId: 'session-1', orgRole: 'basic', status: 'active' }

    // User lookup returns empty
    vi.mocked(db.limit).mockResolvedValueOnce([])

    await expect(requireReauth(request, mockReply, vi.fn())).rejects.toThrow(
      'Re-authentication required',
    )
  })

  it('should throw REAUTH_REQUIRED when no recent OTP verification exists', async () => {
    const request = mockRequest()
    request.user = { id: 'user-1', sessionId: 'session-1', orgRole: 'basic', status: 'active' }

    // User found
    vi.mocked(db.limit)
      .mockResolvedValueOnce([{ phone: '+15551234567' }])
      // No OTP attempts found
      .mockResolvedValueOnce([])

    await expect(requireReauth(request, mockReply, vi.fn())).rejects.toThrow(
      'Re-authentication required',
    )
  })

  it('should throw REAUTH_REQUIRED when OTP verification is older than 5 minutes', async () => {
    const request = mockRequest()
    request.user = { id: 'user-1', sessionId: 'session-1', orgRole: 'basic', status: 'active' }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

    vi.mocked(db.limit)
      .mockResolvedValueOnce([{ phone: '+15551234567' }])
      .mockResolvedValueOnce([{ createdAt: tenMinutesAgo }])

    await expect(requireReauth(request, mockReply, vi.fn())).rejects.toThrow(
      'Re-authentication required',
    )
  })

  it('should pass when OTP verification is within the last 5 minutes', async () => {
    const request = mockRequest()
    request.user = { id: 'user-1', sessionId: 'session-1', orgRole: 'basic', status: 'active' }

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)

    vi.mocked(db.limit)
      .mockResolvedValueOnce([{ phone: '+15551234567' }])
      .mockResolvedValueOnce([{ createdAt: twoMinutesAgo }])

    // Should not throw
    await expect(requireReauth(request, mockReply, vi.fn())).resolves.toBeUndefined()
  })
})
