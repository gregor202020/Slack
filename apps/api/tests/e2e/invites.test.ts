/**
 * E2E tests for the Invites API.
 *
 * Covers: list invites, send invite, resend invite, verify invite,
 * cancel invite, role enforcement, and validation.
 *
 * Routes tested:
 *   GET    /api/invites              — list invites
 *   POST   /api/invites              — send invite
 *   POST   /api/invites/:id/resend   — resend invite
 *   POST   /api/invites/verify       — verify invite token (public)
 *   DELETE /api/invites/:id          — cancel invite
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  cleanupTestData,
} from '../helpers/db'

describe('Invites API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/invites — List invites
  // -------------------------------------------------------------------------

  describe('GET /api/invites — List invites', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list invites for an admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(Array.isArray(body.data)).toBe(true)
    })

    it('should list invites for a super_admin', async () => {
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/invites',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should support pagination with limit parameter', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/invites?limit=5',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('nextCursor')
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/invites — Send invite
  // -------------------------------------------------------------------------

  describe('POST /api/invites — Send invite', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should send an invite for an admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${token}` },
        payload: { phone: '+15551234567' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.phone).toBe('+15551234567')
      expect(body.status).toBeTruthy()
      expect(body.id).toBeTruthy()
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${token}` },
        payload: { phone: '+15551234567' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 422 for invalid phone format', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${token}` },
        payload: { phone: 'not-a-phone' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 422 for missing phone field', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/invites',
        payload: { phone: '+15551234567' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/invites/:id/resend — Resend invite
  // -------------------------------------------------------------------------

  describe('POST /api/invites/:id/resend — Resend invite', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should resend an existing invite', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create an invite first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${token}` },
        payload: { phone: '+15559876543' },
      })
      const invite = createResponse.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/invites/${invite.id}/resend`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/api/invites/${fakeId}/resend`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/api/invites/${fakeId}/resend`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/invites/verify — Verify invite token
  // -------------------------------------------------------------------------

  describe('POST /api/invites/verify — Verify invite token', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return 401 for invalid token and signature', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/invites/verify',
        payload: {
          token: 'invalid-token',
          signature: 'invalid-signature',
          phone: '+15551234567',
        },
      })

      // Expect 401 or 404 depending on implementation
      expect([401, 404]).toContain(response.statusCode)
    })

    it('should return 422 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/invites/verify',
        payload: { token: 'some-token' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 422 for invalid phone format in verify', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/invites/verify',
        payload: {
          token: 'some-token',
          signature: 'some-sig',
          phone: 'bad-phone',
        },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /api/invites/:id — Cancel invite
  // -------------------------------------------------------------------------

  describe('DELETE /api/invites/:id — Cancel invite', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should cancel an existing invite', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create an invite first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/invites',
        headers: { authorization: `Bearer ${token}` },
        payload: { phone: '+15553334444' },
      })
      const invite = createResponse.json()

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invites/${invite.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invites/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invites/${fakeId}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
