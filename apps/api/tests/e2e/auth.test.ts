/**
 * E2E tests for the Auth API.
 *
 * Covers: OTP request, OTP verification, token refresh, logout,
 * get current user, invalid OTP, expired OTP, invalid refresh token.
 *
 * Routes tested:
 *   POST /api/auth          — request OTP
 *   POST /api/auth/verify   — verify OTP
 *   POST /api/auth/refresh  — refresh access token
 *   POST /api/auth/logout   — logout (revoke session)
 *   GET  /api/users/me      — get current user profile
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import {
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken,
} from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  cleanupTestData,
} from '../helpers/db'

describe('Auth API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // POST /api/auth — Request OTP
  // -------------------------------------------------------------------------

  describe('POST /api/auth — Request OTP', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a uniform message for a registered phone', async () => {
      await createTestUser({ phone: '+15551234567' })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth',
        payload: { phone: '+15551234567', method: 'sms' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toContain('verification code')
    })

    it('should return the same uniform message for an unregistered phone', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth',
        payload: { phone: '+15559999999', method: 'sms' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.message).toContain('verification code')
    })

    it('should return 422 for invalid phone format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth',
        payload: { phone: 'not-a-phone', method: 'sms' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 422 for missing phone field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth',
        payload: { method: 'sms' },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/auth/verify — Verify OTP
  // -------------------------------------------------------------------------

  describe('POST /api/auth/verify — Verify OTP', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return 401 for invalid OTP code', async () => {
      await createTestUser({ phone: '+15551234567' })

      // First request an OTP so one exists in the store
      await app.inject({
        method: 'POST',
        url: '/api/auth',
        payload: { phone: '+15551234567', method: 'sms' },
      })

      // Attempt to verify with a wrong code
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { phone: '+15551234567', code: '000000' },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error.code).toBe('INVALID_CREDENTIALS')
    })

    it('should return 401 for expired OTP (no OTP requested)', async () => {
      await createTestUser({ phone: '+15551234567' })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { phone: '+15551234567', code: '123456' },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error.code).toBe('OTP_EXPIRED')
    })

    it('should return 401 for phone not in database', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { phone: '+15559999999', code: '123456' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return 422 for missing code field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/verify',
        payload: { phone: '+15551234567' },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/auth/refresh — Refresh access token
  // -------------------------------------------------------------------------

  describe('POST /api/auth/refresh — Refresh access token', () => {
    it('should return 401 when no refresh token cookie is present', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error.code).toBe('MISSING_REFRESH_TOKEN')
    })

    it('should return 401 for an invalid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: {
          refreshToken: 'totally-invalid-token',
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/auth/logout — Logout
  // -------------------------------------------------------------------------

  describe('POST /api/auth/logout — Logout', () => {
    it('should return 401 when no token is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should successfully logout with a valid session', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 401 for an expired access token', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateExpiredToken(user.id, session.id)

      // Small delay so the token actually expires
      await new Promise((resolve) => setTimeout(resolve, 50))

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return 401 for a token signed with wrong secret', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const token = generateInvalidToken(user.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/users/me — Get current user
  // -------------------------------------------------------------------------

  describe('GET /api/users/me — Get current user', () => {
    it('should return the current user profile', async () => {
      const user = await createTestUser({
        fullName: 'Jane Doe',
        orgRole: 'admin',
      })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(user.id)
      expect(body.fullName).toBe('Jane Doe')
    })

    it('should return 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return 401 for revoked session', async () => {
      const user = await createTestUser()
      const session = await createTestSession(user.id, {
        revokedAt: new Date(),
      })
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error.code).toBe('TOKEN_REVOKED')
    })

    it('should reject a suspended user with 403', async () => {
      const user = await createTestUser({ status: 'suspended' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      expect(response.statusCode).toBe(403)
      const body = response.json()
      expect(body.error.code).toBe('USER_SUSPENDED')
    })

    it('should reject a deactivated user with 403', async () => {
      const user = await createTestUser({ status: 'deactivated' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: {
          authorization: `Bearer ${token}`,
        },
      })

      expect(response.statusCode).toBe(403)
      const body = response.json()
      expect(body.error.code).toBe('USER_DEACTIVATED')
    })

    it('should return error code MISSING_TOKEN when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error.code).toBe('MISSING_TOKEN')
    })
  })
})
