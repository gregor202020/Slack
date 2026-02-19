/**
 * E2E tests for Admin-level routes.
 *
 * Covers: user management (list users, change role, sessions),
 * admin-only access enforcement, and user status operations.
 *
 * Routes tested:
 *   GET   /api/users              — list users (admin only)
 *   PATCH /api/users/:id/role     — change org role
 *   POST  /api/users/:id/suspend  — suspend user
 *   POST  /api/users/:id/unsuspend — unsuspend user
 *   POST  /api/users/:id/deactivate — deactivate user
 *   POST  /api/users/:id/force-logout — force logout
 *   GET   /api/users/:id/sessions — list user sessions
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

describe('Admin API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/users — List users (admin only)
  // -------------------------------------------------------------------------

  describe('GET /api/users — List users', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list users for admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create some users to list
      await createTestUser({ fullName: 'User One', orgRole: 'basic' })
      await createTestUser({ fullName: 'User Two', orgRole: 'mid' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should list users for super_admin', async () => {
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 403 for basic user', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 403 for mid user', async () => {
      const mid = await createTestUser({ orgRole: 'mid' })
      const session = await createTestSession(mid.id)
      const token = generateTestToken(mid.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/users/:id/role — Change role
  // -------------------------------------------------------------------------

  describe('PATCH /api/users/:id/role — Change role', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to change a user role to basic', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/users/${target.id}/role`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: 'mid' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should allow super_admin to change a user role to admin', async () => {
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/users/${target.id}/role`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: 'admin' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 403 for basic user trying to change roles', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/users/${target.id}/role`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: 'admin' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 422 for invalid role value', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/users/${target.id}/role`,
        headers: { authorization: `Bearer ${token}` },
        payload: { role: 'invalid_role' },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/users/:id/suspend — Suspend user
  // -------------------------------------------------------------------------

  describe('POST /api/users/:id/suspend — Suspend user', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to suspend a user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${target.id}/suspend`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 403 for basic user trying to suspend', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${target.id}/suspend`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/users/:id/unsuspend — Unsuspend user
  // -------------------------------------------------------------------------

  describe('POST /api/users/:id/unsuspend — Unsuspend user', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to unsuspend a user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const target = await createTestUser({ orgRole: 'basic', status: 'suspended' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${target.id}/unsuspend`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/users/:id/deactivate — Deactivate user
  // -------------------------------------------------------------------------

  describe('POST /api/users/:id/deactivate — Deactivate user', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to deactivate a user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${target.id}/deactivate`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 403 for basic user', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${target.id}/deactivate`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/users/:id/force-logout — Force logout
  // -------------------------------------------------------------------------

  describe('POST /api/users/:id/force-logout — Force logout', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to force-logout a user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create a session for the target user
      await createTestSession(target.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${target.id}/force-logout`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('revokedCount')
    })

    it('should return 403 for basic user trying to force-logout', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/users/${target.id}/force-logout`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/users/:id/sessions — List user sessions
  // -------------------------------------------------------------------------

  describe('GET /api/users/:id/sessions — List user sessions', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list sessions for admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      await createTestSession(target.id)

      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${target.id}/sessions`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('sessions')
    })

    it('should return 403 for basic user', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const target = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: `/api/users/${target.id}/sessions`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
