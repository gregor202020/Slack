/**
 * E2E tests for the Thread API.
 *
 * Covers: creating thread replies, retrieving thread conversations,
 * thread reply via dedicated thread route, non-member restrictions,
 * and non-existent parent message handling.
 *
 * Routes tested:
 *   POST /api/messages/channel/:channelId      — send message with parentMessageId (thread reply)
 *   POST /api/messages/:messageId/thread        — reply in a thread via dedicated route
 *   GET  /api/messages/:messageId/thread        — get thread replies
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
  cleanupTestData,
} from '../helpers/db'

describe('Thread API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // POST /api/messages/channel/:channelId with parentMessageId — Thread reply
  // -------------------------------------------------------------------------

  describe('POST /api/messages/channel/:channelId — Thread reply via parentMessageId', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a thread reply with parentMessageId', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'thread-parent-test' })
      await addUserToChannel(channel.id, user.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'This is the parent message for thread testing',
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          body: 'This is a thread reply to the parent message',
          parentMessageId: parentMessage.id,
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.parentMessageId).toBe(parentMessage.id)
      expect(body.channelId).toBe(channel.id)
      expect(body.body).toContain('thread reply')
    })

    it('should allow multiple replies in the same thread', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'multi-reply-test' })
      await addUserToChannel(channel.id, user.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Start of a long discussion thread',
      })

      // Send multiple replies
      for (let i = 1; i <= 3; i++) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/messages/channel/${channel.id}`,
          headers: { authorization: `Bearer ${token}` },
          payload: {
            body: `Thread reply number ${i}`,
            parentMessageId: parentMessage.id,
          },
        })
        expect(response.statusCode).toBe(201)
      }

      // Verify all replies exist in the thread
      const threadResponse = await app.inject({
        method: 'GET',
        url: `/api/messages/${parentMessage.id}/thread`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(threadResponse.statusCode).toBe(200)
      const threadBody = threadResponse.json()
      expect(threadBody.messages.length).toBe(3)
    })

    it('should return error for non-existent parent message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bad-parent-test' })
      await addUserToChannel(channel.id, user.id)

      const fakeParentId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          body: 'Reply to nonexistent parent',
          parentMessageId: fakeParentId,
        },
      })

      // Should return 404 because the parent message does not exist
      expect(response.statusCode).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/messages/:messageId/thread — Dedicated thread reply route
  // -------------------------------------------------------------------------

  describe('POST /api/messages/:messageId/thread — Dedicated thread reply', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a thread reply via the dedicated thread endpoint', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'dedicated-thread' })
      await addUserToChannel(channel.id, user.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Parent for dedicated thread route test',
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/${parentMessage.id}/thread`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          body: 'Reply via dedicated thread endpoint',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.parentMessageId).toBe(parentMessage.id)
      expect(body.channelId).toBe(channel.id)
    })

    it('should return 404 for non-existent parent message on dedicated thread route', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeMessageId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/${fakeMessageId}/thread`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          body: 'Reply to nonexistent message',
        },
      })

      expect(response.statusCode).toBe(404)
    })

    it('should return 403 for non-member trying to reply in a thread', async () => {
      const member = await createTestUser({ orgRole: 'basic' })
      const outsider = await createTestUser({ orgRole: 'basic' })
      const outsiderSession = await createTestSession(outsider.id)
      const outsiderToken = generateTestToken(outsider.id, outsiderSession.id)

      const channel = await createTestChannel({ name: 'restricted-thread' })
      await addUserToChannel(channel.id, member.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: member.id,
        body: 'Only members should reply to this',
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/${parentMessage.id}/thread`,
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: {
          body: 'Unauthorized thread reply attempt',
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const channel = await createTestChannel({ name: 'unauth-thread' })
      await addUserToChannel(channel.id, user.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Unauthenticated thread test parent',
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/${parentMessage.id}/thread`,
        payload: {
          body: 'Reply without auth',
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/messages/:messageId/thread — Get thread replies
  // -------------------------------------------------------------------------

  describe('GET /api/messages/:messageId/thread — Get thread replies', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return thread replies for a parent message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'get-thread-test' })
      await addUserToChannel(channel.id, user.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Parent message for thread listing',
      })

      // Create thread replies
      await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'First thread reply',
        parentMessageId: parentMessage.id,
      })
      await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Second thread reply',
        parentMessageId: parentMessage.id,
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/${parentMessage.id}/thread`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('messages')
      expect(body.messages.length).toBe(2)
      // Threads are ordered oldest first (ASC)
      expect(body.messages[0].body).toContain('First')
      expect(body.messages[1].body).toContain('Second')
    })

    it('should return empty array when parent has no replies', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'no-replies-test' })
      await addUserToChannel(channel.id, user.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Lonely message with no replies',
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/${parentMessage.id}/thread`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.messages).toEqual([])
    })

    it('should return 403 for non-member trying to view thread', async () => {
      const member = await createTestUser({ orgRole: 'basic' })
      const outsider = await createTestUser({ orgRole: 'basic' })
      const outsiderSession = await createTestSession(outsider.id)
      const outsiderToken = generateTestToken(outsider.id, outsiderSession.id)

      const channel = await createTestChannel({ name: 'private-thread-view' })
      await addUserToChannel(channel.id, member.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: member.id,
        body: 'Private thread parent',
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/${parentMessage.id}/thread`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 404 for non-existent message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/${fakeId}/thread`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('should support pagination of thread replies', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'paginated-thread' })
      await addUserToChannel(channel.id, user.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Parent for paginated thread',
      })

      // Create enough replies to trigger pagination
      for (let i = 0; i < 5; i++) {
        await createTestMessage({
          channelId: channel.id,
          userId: user.id,
          body: `Paginated thread reply ${i}`,
          parentMessageId: parentMessage.id,
        })
      }

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/${parentMessage.id}/thread?limit=2`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.messages.length).toBe(2)
      expect(body.nextCursor).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // Thread with multiple users
  // -------------------------------------------------------------------------

  describe('Thread with multiple users', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow different channel members to reply in the same thread', async () => {
      const user1 = await createTestUser({ orgRole: 'basic', fullName: 'Thread User One' })
      const user2 = await createTestUser({ orgRole: 'basic', fullName: 'Thread User Two' })
      const session1 = await createTestSession(user1.id)
      const session2 = await createTestSession(user2.id)
      const token1 = generateTestToken(user1.id, session1.id)
      const token2 = generateTestToken(user2.id, session2.id)

      const channel = await createTestChannel({ name: 'multi-user-thread' })
      await addUserToChannel(channel.id, user1.id)
      await addUserToChannel(channel.id, user2.id)

      // User 1 creates the parent message
      const parentResponse = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token1}` },
        payload: { body: 'Who wants to discuss this topic?' },
      })
      expect(parentResponse.statusCode).toBe(201)
      const parentMessage = parentResponse.json()

      // User 2 replies in the thread
      const replyResponse = await app.inject({
        method: 'POST',
        url: `/api/messages/${parentMessage.id}/thread`,
        headers: { authorization: `Bearer ${token2}` },
        payload: { body: 'I would like to discuss this topic!' },
      })
      expect(replyResponse.statusCode).toBe(201)
      const reply = replyResponse.json()
      expect(reply.userId).toBe(user2.id)
      expect(reply.parentMessageId).toBe(parentMessage.id)

      // User 1 also replies
      const reply2Response = await app.inject({
        method: 'POST',
        url: `/api/messages/${parentMessage.id}/thread`,
        headers: { authorization: `Bearer ${token1}` },
        payload: { body: 'Great, let us get started then!' },
      })
      expect(reply2Response.statusCode).toBe(201)

      // Fetch the thread — should have 2 replies
      const threadResponse = await app.inject({
        method: 'GET',
        url: `/api/messages/${parentMessage.id}/thread`,
        headers: { authorization: `Bearer ${token1}` },
      })

      expect(threadResponse.statusCode).toBe(200)
      const threadBody = threadResponse.json()
      expect(threadBody.messages.length).toBe(2)
    })
  })
})
