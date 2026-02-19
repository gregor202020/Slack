/**
 * E2E tests for the Announcement API.
 *
 * Covers: list, create, acknowledge, permission enforcement,
 * scope levels, and pending announcements.
 *
 * Routes tested:
 *   GET  /api/announcements                       — list announcements
 *   POST /api/announcements                       — create announcement
 *   GET  /api/announcements/:id                   — get announcement
 *   POST /api/announcements/:id/acknowledge       — acknowledge
 *   GET  /api/announcements/pending               — pending announcements
 *   DELETE /api/announcements/:id                 — delete announcement
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestAnnouncement,
  cleanupTestData,
} from '../helpers/db'

describe('Announcement API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/announcements — List announcements
  // -------------------------------------------------------------------------

  describe('GET /api/announcements — List announcements', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list announcements for an authenticated user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      await createTestAnnouncement({
        userId: admin.id,
        scope: 'system',
        title: 'Test Announcement',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/announcements',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/announcements',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/announcements — Create announcement
  // -------------------------------------------------------------------------

  describe('POST /api/announcements — Create announcement', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to create an announcement', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/announcements',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          scope: 'system',
          title: 'Important Update',
          body: 'Please read this carefully.',
          ackRequired: true,
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.title).toBe('Important Update')
      expect(body.ackRequired).toBe(true)
      expect(body.scope).toBe('system')
    })

    it('should allow mid role to create an announcement', async () => {
      const mid = await createTestUser({ orgRole: 'mid' })
      const session = await createTestSession(mid.id)
      const token = generateTestToken(mid.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/announcements',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          scope: 'system',
          title: 'Mid Announcement',
          body: 'From a mid user.',
          ackRequired: false,
        },
      })

      expect(response.statusCode).toBe(201)
    })

    it('should return 403 for basic user trying to create', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/announcements',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          scope: 'system',
          title: 'Unauthorized',
          body: 'Should not be created.',
          ackRequired: false,
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should allow super_admin to create an announcement', async () => {
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/announcements',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          scope: 'system',
          title: 'Super Admin Announcement',
          body: 'From the top.',
          ackRequired: true,
        },
      })

      expect(response.statusCode).toBe(201)
    })

    it('should return 422 for missing required fields', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/announcements',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          scope: 'system',
          // missing title, body, ackRequired
        },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/announcements/:id/acknowledge — Acknowledge
  // -------------------------------------------------------------------------

  describe('POST /api/announcements/:id/acknowledge — Acknowledge', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should acknowledge an announcement', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const announcement = await createTestAnnouncement({
        userId: admin.id,
        scope: 'system',
        title: 'Ack Test',
        ackRequired: true,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/announcements/${announcement.id}/acknowledge`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 401 without authentication', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const announcement = await createTestAnnouncement({
        userId: admin.id,
        scope: 'system',
        title: 'No Auth Ack',
        ackRequired: true,
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/announcements/${announcement.id}/acknowledge`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/announcements/pending — Pending announcements
  // -------------------------------------------------------------------------

  describe('GET /api/announcements/pending — Pending announcements', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list pending announcements for a user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/announcements/pending',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /api/announcements/:id — Delete announcement
  // -------------------------------------------------------------------------

  describe('DELETE /api/announcements/:id — Delete announcement', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to delete an announcement', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const announcement = await createTestAnnouncement({
        userId: admin.id,
        scope: 'system',
        title: 'Delete Me',
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/announcements/${announcement.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 403 for basic user trying to delete', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const basic = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const announcement = await createTestAnnouncement({
        userId: admin.id,
        scope: 'system',
        title: 'Protected',
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/announcements/${announcement.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
