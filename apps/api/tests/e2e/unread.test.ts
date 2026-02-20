/**
 * E2E tests for the Unread API.
 *
 * Covers: fetching unread counts, marking channels/DMs as read,
 * verifying own messages don't count, and authentication enforcement.
 *
 * Routes tested:
 *   GET  /api/unread      — get all unread counts for authenticated user
 *   POST /api/unread/read — mark a channel or DM as read
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
  createTestMessage,
  createTestDm,
  cleanupTestData,
} from '../helpers/db'

describe('Unread API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/unread — Get unread counts
  // -------------------------------------------------------------------------

  describe('GET /api/unread — Get unread counts', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return empty counts when there are no unread messages', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'unread-empty-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/unread',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('channels')
      expect(body).toHaveProperty('dms')
      expect(body).toHaveProperty('total')
      expect(body.total).toBe(0)
    })

    it('should count messages from other users as unread', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const otherUser = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'unread-count-test' })
      await addUserToChannel(channel.id, user.id)
      await addUserToChannel(channel.id, otherUser.id)

      // Mark as read first (reset the lastReadAt to now)
      await app.inject({
        method: 'POST',
        url: '/api/unread/read',
        headers: { authorization: `Bearer ${token}` },
        payload: { channelId: channel.id },
      })

      // Wait a tiny bit so createdAt > lastReadAt
      await new Promise((r) => setTimeout(r, 50))

      // Other user sends messages
      await createTestMessage({ channelId: channel.id, userId: otherUser.id, body: 'Hello 1' })
      await createTestMessage({ channelId: channel.id, userId: otherUser.id, body: 'Hello 2' })
      await createTestMessage({ channelId: channel.id, userId: otherUser.id, body: 'Hello 3' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/unread',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.channels[channel.id]).toBe(3)
      expect(body.total).toBe(3)
    })

    it('should NOT count the user\'s own messages as unread', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'unread-own-msg-test' })
      await addUserToChannel(channel.id, user.id)

      // Mark as read first
      await app.inject({
        method: 'POST',
        url: '/api/unread/read',
        headers: { authorization: `Bearer ${token}` },
        payload: { channelId: channel.id },
      })

      // Wait a tiny bit
      await new Promise((r) => setTimeout(r, 50))

      // User sends their own messages — these should NOT be unread
      await createTestMessage({ channelId: channel.id, userId: user.id, body: 'My own message 1' })
      await createTestMessage({ channelId: channel.id, userId: user.id, body: 'My own message 2' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/unread',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      // Own messages should not be counted
      expect(body.channels[channel.id]).toBeUndefined()
      expect(body.total).toBe(0)
    })

    it('should return unread counts for DMs', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const otherUser = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const dm = await createTestDm('direct', [user.id, otherUser.id])

      // Mark DM as read
      await app.inject({
        method: 'POST',
        url: '/api/unread/read',
        headers: { authorization: `Bearer ${token}` },
        payload: { dmId: dm.id },
      })

      // Wait a tiny bit
      await new Promise((r) => setTimeout(r, 50))

      // Other user sends DM messages
      await createTestMessage({ dmId: dm.id, userId: otherUser.id, body: 'DM 1' })
      await createTestMessage({ dmId: dm.id, userId: otherUser.id, body: 'DM 2' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/unread',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.dms[dm.id]).toBe(2)
      expect(body.total).toBe(2)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/unread',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/unread/read — Mark as read
  // -------------------------------------------------------------------------

  describe('POST /api/unread/read — Mark as read', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should mark a channel as read and return success', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const otherUser = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'mark-read-test' })
      await addUserToChannel(channel.id, user.id)
      await addUserToChannel(channel.id, otherUser.id)

      // Other user sends messages
      await createTestMessage({ channelId: channel.id, userId: otherUser.id, body: 'Msg 1' })
      await createTestMessage({ channelId: channel.id, userId: otherUser.id, body: 'Msg 2' })

      // Mark as read
      const markResponse = await app.inject({
        method: 'POST',
        url: '/api/unread/read',
        headers: { authorization: `Bearer ${token}` },
        payload: { channelId: channel.id },
      })

      expect(markResponse.statusCode).toBe(200)
      const markBody = markResponse.json()
      expect(markBody.success).toBe(true)

      // Verify unread count is now 0
      const countResponse = await app.inject({
        method: 'GET',
        url: '/api/unread',
        headers: { authorization: `Bearer ${token}` },
      })

      const countBody = countResponse.json()
      expect(countBody.channels[channel.id]).toBeUndefined()
      expect(countBody.total).toBe(0)
    })

    it('should mark a DM as read', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const otherUser = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const dm = await createTestDm('direct', [user.id, otherUser.id])

      // Other user sends DM messages
      await createTestMessage({ dmId: dm.id, userId: otherUser.id, body: 'DM 1' })

      // Mark as read
      const markResponse = await app.inject({
        method: 'POST',
        url: '/api/unread/read',
        headers: { authorization: `Bearer ${token}` },
        payload: { dmId: dm.id },
      })

      expect(markResponse.statusCode).toBe(200)
      expect(markResponse.json().success).toBe(true)

      // Verify count is 0
      const countResponse = await app.inject({
        method: 'GET',
        url: '/api/unread',
        headers: { authorization: `Bearer ${token}` },
      })

      const countBody = countResponse.json()
      expect(countBody.dms[dm.id]).toBeUndefined()
      expect(countBody.total).toBe(0)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/unread/read',
        payload: { channelId: '00000000-0000-4000-a000-000000000000' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return 422 when neither channelId nor dmId is provided', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/unread/read',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })

      expect(response.statusCode).toBe(422)
    })

    it('should correctly handle marking as read then receiving new messages', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const otherUser = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'mark-then-new-test' })
      await addUserToChannel(channel.id, user.id)
      await addUserToChannel(channel.id, otherUser.id)

      // Other user sends a message
      await createTestMessage({ channelId: channel.id, userId: otherUser.id, body: 'Before mark' })

      // Mark as read
      await app.inject({
        method: 'POST',
        url: '/api/unread/read',
        headers: { authorization: `Bearer ${token}` },
        payload: { channelId: channel.id },
      })

      // Wait to ensure new messages have later timestamps
      await new Promise((r) => setTimeout(r, 50))

      // New messages after marking as read
      await createTestMessage({ channelId: channel.id, userId: otherUser.id, body: 'After mark 1' })
      await createTestMessage({ channelId: channel.id, userId: otherUser.id, body: 'After mark 2' })

      // Check counts — should only show the 2 new messages
      const response = await app.inject({
        method: 'GET',
        url: '/api/unread',
        headers: { authorization: `Bearer ${token}` },
      })

      const body = response.json()
      expect(body.channels[channel.id]).toBe(2)
      expect(body.total).toBe(2)
    })
  })
})
