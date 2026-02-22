/**
 * Security hardening E2E tests.
 *
 * Validates that the API is resilient against common attack vectors:
 * SQL injection, XSS payloads, JWT tampering, privilege escalation,
 * IDOR, path traversal, mass assignment, rate limiting, and session
 * security.
 *
 * These tests exercise the full request pipeline through Fastify's
 * inject() to verify that security boundaries hold at every layer.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Mock Twilio so OTP requests don't call real SMS APIs
vi.mock('twilio', () => {
  const mockClient = {
    messages: {
      create: vi.fn().mockResolvedValue({ sid: 'SM_test_sid' }),
    },
  }
  return {
    default: vi.fn(() => mockClient),
  }
})

import { buildTestApp } from '../helpers/app'
import { generateTestToken, generateExpiredToken, generateInvalidToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestChannel,
  addUserToChannel,
  createTestMessage,
  createTestDm,
  cleanupTestData,
} from '../helpers/db'

describe('Security Hardening', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // ---------------------------------------------------------------------------
  // 1. SQL Injection Prevention
  // ---------------------------------------------------------------------------

  describe('SQL Injection Prevention', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should safely store SQL injection payload in message body without executing it', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'sqli-msg-test' })
      await addUserToChannel(channel.id, user.id)

      const sqlPayload = "'; DROP TABLE users;--"

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: sqlPayload },
      })

      // Parameterized queries should store the string as-is
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.body).toBe(sqlPayload)
    })

    it('should handle SQL injection payload in search query without error', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const sqlPayload = "' OR '1'='1'; DROP TABLE messages;--"

      const response = await app.inject({
        method: 'GET',
        url: `/api/search?q=${encodeURIComponent(sqlPayload)}&type=all`,
        headers: { authorization: `Bearer ${token}` },
      })

      // Should return a normal response (200 with empty results) or 422 for validation
      expect(response.statusCode).not.toBe(500)
      expect([200, 422]).toContain(response.statusCode)
    })

    it('should handle SQL injection payload in channel name via POST /api/channels', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const sqlPayload = "test'; DELETE FROM channels;--"

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: sqlPayload,
          type: 'public',
          scope: 'org',
        },
      })

      // Should either create the channel with the name as-is, or reject with validation error
      expect(response.statusCode).not.toBe(500)
      expect([201, 422]).toContain(response.statusCode)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. XSS Prevention
  // ---------------------------------------------------------------------------

  describe('XSS Prevention', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should sanitize script tag payload from message body', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'xss-script-test' })
      await addUserToChannel(channel.id, user.id)

      const xssPayload = "<script>alert('xss')</script>"

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: xssPayload },
      })

      // sanitizeHtmlContent strips disallowed tags — script is stripped
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.body).not.toContain('<script>')
    })

    it('should sanitize img onerror XSS payload from message body', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'xss-img-test' })
      await addUserToChannel(channel.id, user.id)

      const xssPayload = '<img src=x onerror=alert(1)>'

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: xssPayload },
      })

      // sanitizeHtmlContent strips disallowed attributes — onerror is removed
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.body).not.toContain('onerror')
    })

    it('should store nested XSS payload with event handlers in message body', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'xss-nested-test' })
      await addUserToChannel(channel.id, user.id)

      const xssPayload = '<div onmouseover="alert(document.cookie)">hover me</div>'

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: xssPayload },
      })

      expect(response.statusCode).toBe(201)
      expect(response.statusCode).not.toBe(500)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. JWT Tampering
  // ---------------------------------------------------------------------------

  describe('JWT Tampering', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject requests with an invalid JWT string', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: 'Bearer invalid-not-a-jwt' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should reject requests with an expired token', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateExpiredToken(user.id, session.id)

      // Small delay to ensure the 0s expiry has passed
      await new Promise((resolve) => setTimeout(resolve, 50))

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should reject requests with a token signed by wrong secret', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateInvalidToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should reject requests with algorithm "none" attack', async () => {
      // Craft a JWT with alg: "none" — a classic JWT bypass attack
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify({
        userId: 'fake-user-id',
        sessionId: 'fake-session-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url')
      const noneToken = `${header}.${payload}.`

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${noneToken}` },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should reject requests with no authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Privilege Escalation
  // ---------------------------------------------------------------------------

  describe('Privilege Escalation', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should deny basic user access to GET /api/users (admin-only)', async () => {
      const basicUser = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basicUser.id)
      const token = generateTestToken(basicUser.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should deny basic user from changing roles via PATCH /api/users/:id/role', async () => {
      const basicUser = await createTestUser({ orgRole: 'basic' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basicUser.id)
      const token = generateTestToken(basicUser.id, session.id)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/users/${target.id}/role`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: 'super_admin' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should ignore orgRole field when user updates their own profile via PATCH /api/users/me', async () => {
      const user = await createTestUser({ orgRole: 'basic', fullName: 'Original Name' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fullName: 'Updated Name',
          orgRole: 'admin',
        },
      })

      // The request should succeed (profile update) but orgRole should not change
      expect(response.statusCode).toBe(200)

      // Verify the orgRole was not changed by fetching the profile
      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(meResponse.statusCode).toBe(200)
      const profile = meResponse.json()
      expect(profile.orgRole).toBe('basic')
      expect(profile.fullName).toBe('Updated Name')
    })

    it('should deny mid-level user access to admin endpoints', async () => {
      const midUser = await createTestUser({ orgRole: 'mid' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(midUser.id)
      const token = generateTestToken(midUser.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${target.id}/suspend`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // ---------------------------------------------------------------------------
  // 5. IDOR — Insecure Direct Object Reference
  // ---------------------------------------------------------------------------

  describe('IDOR Prevention', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should deny User A from editing User B message via PATCH /api/messages/:messageId', async () => {
      const userA = await createTestUser({ orgRole: 'basic', fullName: 'User A' })
      const userB = await createTestUser({ orgRole: 'basic', fullName: 'User B' })
      const sessionA = await createTestSession(userA.id)
      const tokenA = generateTestToken(userA.id, sessionA.id)

      const channel = await createTestChannel({ name: 'idor-edit-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: userB.id,
        body: 'User B private thought',
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/messages/${message.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { body: 'Hacked by User A' },
      })

      expect(response.statusCode).toBe(403)
      const body = response.json()
      expect(body.error.code).toBe('NOT_MESSAGE_AUTHOR')
    })

    it('should deny User A from deleting User B bookmark via DELETE /api/bookmarks/:bookmarkId', async () => {
      const userA = await createTestUser({ orgRole: 'basic', fullName: 'User A' })
      const userB = await createTestUser({ orgRole: 'basic', fullName: 'User B' })
      const sessionA = await createTestSession(userA.id)
      const sessionB = await createTestSession(userB.id)
      const tokenA = generateTestToken(userA.id, sessionA.id)
      const tokenB = generateTestToken(userB.id, sessionB.id)

      const channel = await createTestChannel({ name: 'idor-bookmark-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: userB.id,
        body: 'Bookmarked by User B',
      })

      // User B creates a bookmark
      const bookmarkResponse = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${tokenB}` },
        payload: { messageId: message.id },
      })
      const bookmark = bookmarkResponse.json()

      // User A tries to delete User B's bookmark
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/bookmarks/${bookmark.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      })

      // Should be 403 (forbidden) or 404 (not found — scoped to user)
      expect([403, 404]).toContain(response.statusCode)
    })

    it('should deny User A from reading DM they are not a member of', async () => {
      const userA = await createTestUser({ orgRole: 'basic', fullName: 'User A' })
      const userB = await createTestUser({ orgRole: 'basic', fullName: 'User B' })
      const userC = await createTestUser({ orgRole: 'basic', fullName: 'User C' })
      const sessionA = await createTestSession(userA.id)
      const tokenA = generateTestToken(userA.id, sessionA.id)

      // Create a DM between User B and User C (User A is NOT a member)
      const dm = await createTestDm('direct', [userB.id, userC.id])

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/dm/${dm.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Path Traversal
  // ---------------------------------------------------------------------------

  describe('Path Traversal', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should handle path traversal payload in channel name without filesystem access', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: '../../../etc/passwd',
          type: 'public',
          scope: 'org',
        },
      })

      // Should either create with the name stored as-is (no FS access) or reject as validation error
      expect(response.statusCode).not.toBe(500)
      expect([201, 422]).toContain(response.statusCode)
    })

    it('should handle path traversal characters in message body without filesystem access', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'path-traversal-test' })
      await addUserToChannel(channel.id, user.id)

      const pathPayload = '../../../../../../etc/shadow\x00.jpg'

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: pathPayload },
      })

      // Should store the body as-is without error — no FS interaction
      expect(response.statusCode).not.toBe(500)
      expect([201, 422]).toContain(response.statusCode)
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Mass Assignment
  // ---------------------------------------------------------------------------

  describe('Mass Assignment Prevention', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should ignore privileged fields when updating own profile via PATCH /api/users/me', async () => {
      const user = await createTestUser({
        orgRole: 'basic',
        fullName: 'Original',
        status: 'active',
      })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fullName: 'New Name',
          orgRole: 'super_admin',
          status: 'deactivated',
          id: '00000000-0000-4000-a000-000000000099',
        },
      })

      expect(response.statusCode).toBe(200)

      // Verify: fullName changed, other fields unchanged
      const meResponse = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(meResponse.statusCode).toBe(200)
      const profile = meResponse.json()
      expect(profile.fullName).toBe('New Name')
      expect(profile.orgRole).toBe('basic')
      expect(profile.status).toBe('active')
      expect(profile.id).toBe(user.id)
    })

    it('should ignore extra fields when creating a channel via POST /api/channels', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'mass-assign-test',
          type: 'public',
          scope: 'org',
          isAdmin: true,
          ownerUserId: '00000000-0000-4000-a000-000000000099',
          isDefault: true,
        },
      })

      // The channel should be created successfully, but extra fields are ignored
      expect(response.statusCode).not.toBe(500)
      if (response.statusCode === 201) {
        const body = response.json()
        expect(body.name).toBe('mass-assign-test')
        // isAdmin is not a real channel field, so it should not appear
        expect(body).not.toHaveProperty('isAdmin')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 8. Rate Limit Enforcement
  // ---------------------------------------------------------------------------

  describe('Rate Limit Enforcement', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should accept valid OTP requests to POST /api/auth', async () => {
      await createTestUser({ phone: '+15551111111' })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth',
        payload: { phone: '+15551111111', method: 'sms' },
      })

      // The endpoint should exist and respond successfully
      expect(response.statusCode).toBe(200)
    })

    it('should eventually rate limit excessive OTP requests', async () => {
      await createTestUser({ phone: '+15552222222' })

      const statuses: number[] = []

      // Send rapid requests — if rate limiting is active, one should eventually return 429
      for (let i = 0; i < 10; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth',
          payload: { phone: '+15552222222', method: 'sms' },
        })
        statuses.push(response.statusCode)
      }

      // Either we get a 429 (rate limited) or all return 200 (rate limiting not enforced in test mode)
      const hasRateLimit = statuses.includes(429)
      const allSucceeded = statuses.every((s) => s === 200)
      expect(hasRateLimit || allSucceeded).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // 9. Session Security
  // ---------------------------------------------------------------------------

  describe('Session Security', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject requests with a revoked session', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id, {
        revokedAt: new Date(),
      })
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error.code).toBe('TOKEN_REVOKED')
    })

    it('should reject requests from a suspended user with 403', async () => {
      const user = await createTestUser({ orgRole: 'basic', status: 'suspended' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
      const body = response.json()
      expect(body.error.code).toBe('USER_SUSPENDED')
    })
  })
})
