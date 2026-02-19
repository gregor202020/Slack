/**
 * E2E tests for the DM API.
 *
 * Covers: create direct/group DMs, duplicate detection, listing,
 * sending messages, get by ID, dissolve.
 *
 * Routes tested:
 *   POST /api/dms              — create DM
 *   GET  /api/dms              — list user's DMs
 *   GET  /api/dms/:dmId        — get DM details
 *   GET  /api/dms/:dmId/messages — get DM messages
 *   POST /api/dms/:dmId/dissolve — dissolve DM (admin)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestDm,
  createTestMessage,
  cleanupTestData,
} from '../helpers/db'

describe('DM API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // POST /api/dms — Create DM
  // -------------------------------------------------------------------------

  describe('POST /api/dms — Create DM', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a direct DM between two users', async () => {
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const session = await createTestSession(userA.id)
      const token = generateTestToken(userA.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/dms',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'direct',
          memberUserIds: [userA.id, userB.id],
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.type).toBe('direct')
      expect(body.members).toHaveLength(2)
    })

    it('should return existing DM when duplicate direct DM is created', async () => {
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const session = await createTestSession(userA.id)
      const token = generateTestToken(userA.id, session.id)

      // First creation
      const first = await app.inject({
        method: 'POST',
        url: '/api/dms',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'direct',
          memberUserIds: [userA.id, userB.id],
        },
      })

      expect(first.statusCode).toBe(201)
      const firstDm = first.json()

      // Second creation — should return the same DM
      const second = await app.inject({
        method: 'POST',
        url: '/api/dms',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'direct',
          memberUserIds: [userA.id, userB.id],
        },
      })

      expect(second.statusCode).toBe(201)
      const secondDm = second.json()
      expect(secondDm.id).toBe(firstDm.id)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dms',
        payload: {
          type: 'direct',
          memberUserIds: ['00000000-0000-4000-a000-000000000000'],
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/dms — List user's DMs
  // -------------------------------------------------------------------------

  describe('GET /api/dms — List DMs', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list DMs for authenticated user', async () => {
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const session = await createTestSession(userA.id)
      const token = generateTestToken(userA.id, session.id)

      // Create a DM
      await createTestDm('direct', [userA.id, userB.id])

      const response = await app.inject({
        method: 'GET',
        url: '/api/dms',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('dms')
      expect(Array.isArray(body.dms)).toBe(true)
      expect(body.dms.length).toBeGreaterThanOrEqual(1)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dms',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/dms/:dmId — Get DM by ID
  // -------------------------------------------------------------------------

  describe('GET /api/dms/:dmId — Get DM details', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return DM details for a member', async () => {
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const session = await createTestSession(userA.id)
      const token = generateTestToken(userA.id, session.id)

      const dm = await createTestDm('direct', [userA.id, userB.id])

      const response = await app.inject({
        method: 'GET',
        url: `/api/dms/${dm.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(dm.id)
      expect(body.type).toBe('direct')
      expect(body.members).toHaveLength(2)
    })

    it('should return 403 for non-member', async () => {
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const outsider = await createTestUser({ fullName: 'Charlie' })
      const session = await createTestSession(outsider.id)
      const token = generateTestToken(outsider.id, session.id)

      const dm = await createTestDm('direct', [userA.id, userB.id])

      const response = await app.inject({
        method: 'GET',
        url: `/api/dms/${dm.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // Send DM message (via /api/dms/:dmId/messages)
  // -------------------------------------------------------------------------

  describe('GET /api/dms/:dmId/messages — DM messages', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list DM messages for a member', async () => {
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const session = await createTestSession(userA.id)
      const token = generateTestToken(userA.id, session.id)

      const dm = await createTestDm('direct', [userA.id, userB.id])

      // Create messages directly in the DM
      await createTestMessage({ dmId: dm.id, userId: userA.id, body: 'Hello Bob!' })
      await createTestMessage({ dmId: dm.id, userId: userB.id, body: 'Hi Alice!' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/dms/${dm.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('messages')
      expect(body.messages.length).toBeGreaterThanOrEqual(2)
    })

    it('should return 403 for non-member accessing DM messages', async () => {
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const outsider = await createTestUser({ fullName: 'Charlie' })
      const session = await createTestSession(outsider.id)
      const token = generateTestToken(outsider.id, session.id)

      const dm = await createTestDm('direct', [userA.id, userB.id])

      const response = await app.inject({
        method: 'GET',
        url: `/api/dms/${dm.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/dms/:dmId/dissolve — Dissolve DM
  // -------------------------------------------------------------------------

  describe('POST /api/dms/:dmId/dissolve — Dissolve DM', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to dissolve a DM', async () => {
      const admin = await createTestUser({ orgRole: 'admin', fullName: 'Admin' })
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const dm = await createTestDm('group', [userA.id, userB.id])

      const response = await app.inject({
        method: 'POST',
        url: `/api/dms/${dm.id}/dissolve`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 for basic user trying to dissolve', async () => {
      const basic = await createTestUser({ orgRole: 'basic', fullName: 'Basic' })
      const userA = await createTestUser({ fullName: 'Alice' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const dm = await createTestDm('direct', [basic.id, userA.id])

      const response = await app.inject({
        method: 'POST',
        url: `/api/dms/${dm.id}/dissolve`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
