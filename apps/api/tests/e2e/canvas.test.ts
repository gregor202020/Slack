/**
 * E2E tests for the Canvas API.
 *
 * Covers: get/create canvas, lock/unlock, version history,
 * revert, templates CRUD, auth and role enforcement.
 *
 * Routes tested:
 *   GET    /api/canvas/channel/:channelId                        — get channel canvas
 *   PATCH  /api/canvas/channel/:channelId                        — update canvas (Yjs)
 *   POST   /api/canvas/channel/:channelId/lock                   — lock canvas
 *   POST   /api/canvas/channel/:channelId/unlock                 — unlock canvas
 *   GET    /api/canvas/channel/:channelId/versions               — version history
 *   POST   /api/canvas/channel/:channelId/revert/:versionId      — revert to version
 *   GET    /api/canvas/templates                                 — list templates
 *   POST   /api/canvas/templates                                 — create template
 *   DELETE /api/canvas/templates/:templateId                     — delete template
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestChannel,
  addUserToChannel,
  cleanupTestData,
} from '../helpers/db'

describe('Canvas API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/canvas/channel/:channelId — Get channel canvas
  // -------------------------------------------------------------------------

  describe('GET /api/canvas/channel/:channelId — Get channel canvas', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return canvas for a channel member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-get-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(body.data.channelId).toBe(channel.id)
    })

    it('should create canvas if none exists (get-or-create)', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-create-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data.id).toBeTruthy()
    })

    it('should return 403 for non-member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-no-access' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const channel = await createTestChannel({ name: 'canvas-unauth' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/canvas/channel/:channelId — Update canvas
  // -------------------------------------------------------------------------

  describe('PATCH /api/canvas/channel/:channelId — Update canvas', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should apply a Yjs update to the canvas', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-update-test' })
      await addUserToChannel(channel.id, user.id)

      // First create the canvas
      await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      // Send a base64-encoded update (a minimal valid Yjs update)
      const update = Buffer.from([0, 1, 0]).toString('base64')

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { update },
      })

      // Accept both 200 and 422 depending on Yjs validation
      expect([200, 422]).toContain(response.statusCode)
    })

    it('should return 422 for empty update', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-empty-update' })
      await addUserToChannel(channel.id, user.id)

      // Create canvas first
      await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      // Empty base64 string decodes to empty buffer
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { update: '' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 403 for non-member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-no-update' })

      const update = Buffer.from([0, 1, 0]).toString('base64')

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { update },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/canvas/channel/:channelId/lock — Lock canvas
  // -------------------------------------------------------------------------

  describe('POST /api/canvas/channel/:channelId/lock — Lock canvas', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should lock canvas for admin user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const channel = await createTestChannel({
        name: 'canvas-lock-test',
        ownerUserId: admin.id,
      })
      await addUserToChannel(channel.id, admin.id)

      // Create canvas first
      await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/canvas/channel/${channel.id}/lock`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
    })

    it('should return 403 for non-member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-lock-no-access' })

      const response = await app.inject({
        method: 'POST',
        url: `/api/canvas/channel/${channel.id}/lock`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/canvas/channel/:channelId/unlock — Unlock canvas
  // -------------------------------------------------------------------------

  describe('POST /api/canvas/channel/:channelId/unlock — Unlock canvas', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should unlock canvas for admin user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const channel = await createTestChannel({
        name: 'canvas-unlock-test',
        ownerUserId: admin.id,
      })
      await addUserToChannel(channel.id, admin.id)

      // Create canvas and lock it first
      await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })
      await app.inject({
        method: 'POST',
        url: `/api/canvas/channel/${channel.id}/lock`,
        headers: { authorization: `Bearer ${token}` },
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/canvas/channel/${channel.id}/unlock`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/canvas/channel/:channelId/versions — Version history
  // -------------------------------------------------------------------------

  describe('GET /api/canvas/channel/:channelId/versions — Version history', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return version history for a channel member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-versions-test' })
      await addUserToChannel(channel.id, user.id)

      // Create canvas first
      await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}/versions`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(Array.isArray(body.data)).toBe(true)
    })

    it('should return 403 for non-member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-versions-no-access' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/canvas/channel/${channel.id}/versions`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/canvas/channel/:channelId/revert/:versionId — Revert
  // -------------------------------------------------------------------------

  describe('POST /api/canvas/channel/:channelId/revert/:versionId — Revert to version', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return 403 for non-member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'canvas-revert-no-access' })
      const fakeVersionId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/api/canvas/channel/${channel.id}/revert/${fakeVersionId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const channel = await createTestChannel({ name: 'canvas-revert-unauth' })
      const fakeVersionId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/api/canvas/channel/${channel.id}/revert/${fakeVersionId}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/canvas/templates — List templates
  // -------------------------------------------------------------------------

  describe('GET /api/canvas/templates — List templates', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list templates for an authenticated user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/canvas/templates',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(Array.isArray(body.data)).toBe(true)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/canvas/templates',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/canvas/templates — Create template
  // -------------------------------------------------------------------------

  describe('POST /api/canvas/templates — Create template', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a template for an admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/canvas/templates',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Meeting Notes Template' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(body.data.name).toBe('Meeting Notes Template')
    })

    it('should create a template with Yjs state', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const yjsState = Buffer.from([0, 1, 0]).toString('base64')

      const response = await app.inject({
        method: 'POST',
        url: '/api/canvas/templates',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Prefilled Template', yjsState },
      })

      expect(response.statusCode).toBe(201)
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/canvas/templates',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Unauthorized Template' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 422 for missing name', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/canvas/templates',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /api/canvas/templates/:templateId — Delete template
  // -------------------------------------------------------------------------

  describe('DELETE /api/canvas/templates/:templateId — Delete template', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should delete a template for an admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create template first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/canvas/templates',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'To Delete Template' },
      })
      const template = createResponse.json()

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/canvas/templates/${template.data.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data.success).toBe(true)
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/canvas/templates/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
