/**
 * E2E tests for the Notifications API.
 *
 * Covers: register device, unregister device, get preferences,
 * update preferences, auth enforcement, and validation.
 *
 * Routes tested:
 *   POST   /api/notifications/register      — register device for push
 *   DELETE /api/notifications/unregister     — unregister device
 *   GET    /api/notifications/preferences    — get notification preferences
 *   PUT    /api/notifications/preferences    — update notification preferences
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

describe('Notifications API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // POST /api/notifications/register — Register device
  // -------------------------------------------------------------------------

  describe('POST /api/notifications/register — Register device', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should register a device token for push notifications', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          token: 'test-device-token-abc123',
          platform: 'ios',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should register an Android device token', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          token: 'android-device-token-xyz789',
          platform: 'android',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should register a web push token', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          token: 'web-push-token-456',
          platform: 'web',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 422 for missing token', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/register',
        headers: { authorization: `Bearer ${token}` },
        payload: { platform: 'ios' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 422 for missing platform', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/register',
        headers: { authorization: `Bearer ${token}` },
        payload: { token: 'some-token' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 422 for invalid platform value', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          token: 'some-token',
          platform: 'windows',
        },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/notifications/register',
        payload: {
          token: 'test-token',
          platform: 'ios',
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /api/notifications/unregister — Unregister device
  // -------------------------------------------------------------------------

  describe('DELETE /api/notifications/unregister — Unregister device', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should unregister a device token', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      // Register first
      await app.inject({
        method: 'POST',
        url: '/api/notifications/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          token: 'device-to-unregister',
          platform: 'ios',
        },
      })

      // Unregister
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/notifications/unregister',
        headers: { authorization: `Bearer ${token}` },
        payload: { token: 'device-to-unregister' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 422 for missing token', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/notifications/unregister',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/notifications/unregister',
        payload: { token: 'some-token' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/notifications/preferences — Get notification preferences
  // -------------------------------------------------------------------------

  describe('GET /api/notifications/preferences — Get preferences', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return default notification preferences', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/preferences',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('announcements')
      expect(body).toHaveProperty('shifts')
      expect(body).toHaveProperty('dms')
      expect(body).toHaveProperty('channelMessages')
      expect(body).toHaveProperty('quietHoursEnabled')
    })

    it('should return defaults when no preferences are set', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/preferences',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.announcements).toBe(true)
      expect(body.shifts).toBe(true)
      expect(body.dms).toBe(true)
      expect(body.channelMessages).toBe(true)
      expect(body.quietHoursEnabled).toBe(false)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/preferences',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // PUT /api/notifications/preferences — Update notification preferences
  // -------------------------------------------------------------------------

  describe('PUT /api/notifications/preferences — Update preferences', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update notification preferences', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'PUT',
        url: '/api/notifications/preferences',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          announcements: false,
          dms: false,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.announcements).toBe(false)
      expect(body.dms).toBe(false)
      // Unchanged defaults should persist
      expect(body.shifts).toBe(true)
      expect(body.channelMessages).toBe(true)
    })

    it('should enable quiet hours', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'PUT',
        url: '/api/notifications/preferences',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          quietHoursEnabled: true,
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.quietHoursEnabled).toBe(true)
      expect(body.quietHoursStart).toBe('22:00')
      expect(body.quietHoursEnd).toBe('07:00')
    })

    it('should persist preferences across requests', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      // Update preferences
      await app.inject({
        method: 'PUT',
        url: '/api/notifications/preferences',
        headers: { authorization: `Bearer ${token}` },
        payload: { shifts: false },
      })

      // Verify they persist on GET
      const response = await app.inject({
        method: 'GET',
        url: '/api/notifications/preferences',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.shifts).toBe(false)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/notifications/preferences',
        payload: { announcements: false },
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
