/**
 * E2E tests for the Message API.
 *
 * Covers: list messages, send message, edit message, delete message,
 * reactions, mentions, thread replies, and permission enforcement.
 *
 * Routes tested:
 *   GET    /api/messages/channel/:channelId — list channel messages
 *   POST   /api/messages/channel/:channelId — send channel message
 *   GET    /api/messages/:messageId         — get single message
 *   PATCH  /api/messages/:messageId         — edit message
 *   DELETE /api/messages/:messageId         — delete message
 *   POST   /api/reactions                   — add reaction
 *   DELETE /api/reactions/:reactionId       — remove reaction
 *   GET    /api/reactions/message/:messageId — list reactions
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

describe('Message API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/messages/channel/:channelId — List channel messages
  // -------------------------------------------------------------------------

  describe('GET /api/messages/channel/:channelId — List messages', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list messages for a channel member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'msg-list-test' })
      await addUserToChannel(channel.id, user.id)

      // Create a few test messages
      await createTestMessage({ channelId: channel.id, userId: user.id, body: 'Hello' })
      await createTestMessage({ channelId: channel.id, userId: user.id, body: 'World' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('messages')
      expect(body.messages.length).toBeGreaterThanOrEqual(2)
    })

    it('should support cursor-based pagination', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'pagination-test' })
      await addUserToChannel(channel.id, user.id)

      // Create messages
      for (let i = 0; i < 5; i++) {
        await createTestMessage({
          channelId: channel.id,
          userId: user.id,
          body: `Message ${i}`,
        })
      }

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}?limit=2`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.messages.length).toBe(2)
      expect(body.nextCursor).toBeTruthy()
    })

    it('should return 403 for non-member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'restricted-msgs' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const channel = await createTestChannel({ name: 'unauth-test' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/messages/channel/:channelId — Send message
  // -------------------------------------------------------------------------

  describe('POST /api/messages/channel/:channelId — Send message', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should send a message to a channel', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'send-msg-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Hello from tests!' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.body).toBe('Hello from tests!')
      expect(body.channelId).toBe(channel.id)
      expect(body.userId).toBe(user.id)
    })

    it('should send a message with @channel mention', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'mention-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Hey @channel check this out!' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.body).toContain('@channel')
    })

    it('should send a thread reply', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'thread-test' })
      await addUserToChannel(channel.id, user.id)

      const parentMessage = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Parent message',
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          body: 'Thread reply',
          parentMessageId: parentMessage.id,
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.parentMessageId).toBe(parentMessage.id)
    })

    it('should return 403 for non-member trying to send', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'no-send' })

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Should not work' },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 422 for empty body', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'empty-body-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: '' },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/messages/:messageId — Edit message
  // -------------------------------------------------------------------------

  describe('PATCH /api/messages/:messageId — Edit message', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow the author to edit their message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'edit-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Original message',
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/messages/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Edited message' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.body).toBe('Edited message')
    })

    it('should return 403 when another user tries to edit', async () => {
      const author = await createTestUser({ orgRole: 'basic' })
      const otherUser = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(otherUser.id)
      const token = generateTestToken(otherUser.id, session.id)

      const channel = await createTestChannel({ name: 'no-edit' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: author.id,
        body: 'Not yours',
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/messages/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Hacked' },
      })

      expect(response.statusCode).toBe(403)
      const body = response.json()
      expect(body.error.code).toBe('NOT_MESSAGE_AUTHOR')
    })

    it('should return 403 even for super_admin editing others message', async () => {
      const author = await createTestUser({ orgRole: 'basic' })
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const channel = await createTestChannel({ name: 'super-edit' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: author.id,
        body: 'Protected',
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/messages/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Admin edit attempt' },
      })

      // Per spec: only the author can edit, no exception for super_admin
      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /api/messages/:messageId — Delete message
  // -------------------------------------------------------------------------

  describe('DELETE /api/messages/:messageId — Delete message', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow the author to delete their message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'delete-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'To be deleted',
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/messages/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should allow super_admin to delete any message', async () => {
      const author = await createTestUser({ orgRole: 'basic' })
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const channel = await createTestChannel({ name: 'admin-delete' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: author.id,
        body: 'Admin will delete this',
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/messages/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 403 for non-author non-admin', async () => {
      const author = await createTestUser({ orgRole: 'basic' })
      const other = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(other.id)
      const token = generateTestToken(other.id, session.id)

      const channel = await createTestChannel({ name: 'no-delete' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: author.id,
        body: 'Cannot delete',
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/messages/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 404 for non-existent message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/messages/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // Reactions
  // -------------------------------------------------------------------------

  describe('Reactions API', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should add a reaction to a message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'reaction-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'React to this',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/reactions',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          messageId: message.id,
          emoji: '👍',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.emoji).toBe('👍')
      expect(body.userId).toBe(user.id)
      expect(body.messageId).toBe(message.id)
    })

    it('should list reactions for a message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'list-reactions' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Has reactions',
      })

      // Add a reaction first
      await app.inject({
        method: 'POST',
        url: '/api/reactions',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id, emoji: '🔥' },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/reactions/message/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBe(1)
      expect(body[0].emoji).toBe('🔥')
    })

    it('should remove a reaction', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'remove-reaction' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Remove reaction',
      })

      // Add a reaction
      const addResponse = await app.inject({
        method: 'POST',
        url: '/api/reactions',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id, emoji: '❤️' },
      })
      const reaction = addResponse.json()

      // Remove it
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/reactions/${reaction.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 when removing another users reaction', async () => {
      const user1 = await createTestUser({ orgRole: 'basic' })
      const user2 = await createTestUser({ orgRole: 'basic' })
      const session1 = await createTestSession(user1.id)
      const session2 = await createTestSession(user2.id)
      const token1 = generateTestToken(user1.id, session1.id)
      const token2 = generateTestToken(user2.id, session2.id)

      const channel = await createTestChannel({ name: 'steal-reaction' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user1.id,
        body: 'Shared message',
      })

      // User 1 adds a reaction
      const addResponse = await app.inject({
        method: 'POST',
        url: '/api/reactions',
        headers: { authorization: `Bearer ${token1}` },
        payload: { messageId: message.id, emoji: '😀' },
      })
      const reaction = addResponse.json()

      // User 2 tries to remove it
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/reactions/${reaction.id}`,
        headers: { authorization: `Bearer ${token2}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
