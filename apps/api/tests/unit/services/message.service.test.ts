/**
 * Unit tests for message.service.ts.
 *
 * Tests message creation, edit permissions, delete permissions,
 * and reaction logic at the service layer.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

// Mock socket.io emitters
vi.mock('../../../src/plugins/socket.js', () => ({
  initializeSocketIO: vi.fn(),
  getIO: vi.fn(() => ({
    to: () => ({ emit: vi.fn() }),
    emit: vi.fn(),
  })),
  emitToChannel: vi.fn(),
  emitToDm: vi.fn(),
  emitToUser: vi.fn(),
  disconnectUser: vi.fn(),
  removeFromChannelRoom: vi.fn(),
  getOnlineUsers: vi.fn(() => new Set()),
  shutdownSocketIO: vi.fn(),
}))

vi.mock('../../../src/plugins/firebase.js', () => ({
  initFirebase: vi.fn(),
  getFirebaseApp: vi.fn(() => null),
}))

import { loadConfig } from '../../../src/lib/config.js'
import {
  sendChannelMessage,
  editMessage,
  deleteMessage,
  getMessageById,
  addReaction,
  removeReaction,
} from '../../../src/services/message.service.js'
import {
  createTestUser,
  createTestChannel,
  addUserToChannel,
  createTestMessage,
  cleanupTestData,
} from '../../helpers/db'

describe('Message Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // sendChannelMessage
  // -------------------------------------------------------------------------

  describe('sendChannelMessage', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a message in a channel', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-send-test' })

      const message = await sendChannelMessage(
        channel.id,
        'Hello from service test',
        user.id,
      )

      expect(message).toBeDefined()
      expect(message.body).toBe('Hello from service test')
      expect(message.channelId).toBe(channel.id)
      expect(message.userId).toBe(user.id)
    })

    it('should create a thread reply', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-thread-test' })
      const parent = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Parent',
      })

      const reply = await sendChannelMessage(
        channel.id,
        'Reply message',
        user.id,
        parent.id,
      )

      expect(reply.parentMessageId).toBe(parent.id)
    })

    it('should throw when parent message is in a different channel', async () => {
      const user = await createTestUser()
      const channel1 = await createTestChannel({ name: 'svc-ch1' })
      const channel2 = await createTestChannel({ name: 'svc-ch2' })
      const parent = await createTestMessage({
        channelId: channel1.id,
        userId: user.id,
        body: 'Wrong channel parent',
      })

      await expect(
        sendChannelMessage(channel2.id, 'Cross-channel reply', user.id, parent.id),
      ).rejects.toThrow()
    })

    it('should sanitize HTML in message body', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-sanitize' })

      const message = await sendChannelMessage(
        channel.id,
        '<script>alert("xss")</script>Hello',
        user.id,
      )

      // The sanitizer should strip the script tag
      expect(message.body).not.toContain('<script>')
      expect(message.body).toContain('Hello')
    })
  })

  // -------------------------------------------------------------------------
  // editMessage
  // -------------------------------------------------------------------------

  describe('editMessage', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow the author to edit their message', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-edit-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Original',
      })

      const updated = await editMessage(message.id, 'Updated body', user.id, 'basic')

      expect(updated).toBeDefined()
      expect(updated!.body).toBe('Updated body')
    })

    it('should reject edit by a different user', async () => {
      const author = await createTestUser()
      const other = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-no-edit' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: author.id,
        body: 'Protected',
      })

      await expect(
        editMessage(message.id, 'Hacked', other.id, 'basic'),
      ).rejects.toThrow()
    })

    it('should reject edit by super_admin (only author can edit)', async () => {
      const author = await createTestUser()
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const channel = await createTestChannel({ name: 'svc-admin-no-edit' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: author.id,
        body: 'Author only',
      })

      await expect(
        editMessage(message.id, 'Admin edit', superAdmin.id, 'super_admin'),
      ).rejects.toThrow()
    })

    it('should throw for non-existent message', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        editMessage(fakeId, 'Ghost message', user.id, 'basic'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // deleteMessage
  // -------------------------------------------------------------------------

  describe('deleteMessage', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow the author to delete their message', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-delete-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Delete me',
      })

      const result = await deleteMessage(
        message.id,
        user.id,
        'basic',
        '127.0.0.1',
        'test-agent',
      )

      expect(result.success).toBe(true)
    })

    it('should allow super_admin to delete any message', async () => {
      const author = await createTestUser()
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const channel = await createTestChannel({ name: 'svc-admin-delete' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: author.id,
        body: 'Admin will delete',
      })

      const result = await deleteMessage(
        message.id,
        superAdmin.id,
        'super_admin',
        '127.0.0.1',
        'test-agent',
      )

      expect(result.success).toBe(true)
    })

    it('should reject delete by non-author non-admin', async () => {
      const author = await createTestUser()
      const other = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-no-delete' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: author.id,
        body: 'Cannot delete',
      })

      await expect(
        deleteMessage(message.id, other.id, 'basic', '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })

    it('should throw for non-existent message', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        deleteMessage(fakeId, user.id, 'basic', '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // getMessageById
  // -------------------------------------------------------------------------

  describe('getMessageById', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a message by ID', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-get-msg' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Find me',
      })

      const found = await getMessageById(message.id)

      expect(found.id).toBe(message.id)
      expect(found.body).toBe('Find me')
    })

    it('should throw for non-existent message', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getMessageById(fakeId)).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // Reactions
  // -------------------------------------------------------------------------

  describe('addReaction / removeReaction', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should add a reaction to a message', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-reaction-add' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'React to this',
      })

      const reaction = await addReaction(message.id, '👍', user.id)

      expect(reaction).toBeDefined()
      expect(reaction!.emoji).toBe('👍')
      expect(reaction!.userId).toBe(user.id)
    })

    it('should throw for duplicate reaction', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-reaction-dup' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Dup reaction',
      })

      await addReaction(message.id, '👍', user.id)

      await expect(
        addReaction(message.id, '👍', user.id),
      ).rejects.toThrow()
    })

    it('should remove a reaction', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-reaction-rm' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Remove reaction',
      })

      const reaction = await addReaction(message.id, '🔥', user.id)

      const result = await removeReaction(reaction!.id, user.id)
      expect(result.success).toBe(true)
    })

    it('should reject removing another users reaction', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const channel = await createTestChannel({ name: 'svc-reaction-steal' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user1.id,
        body: 'Shared',
      })

      const reaction = await addReaction(message.id, '❤️', user1.id)

      await expect(
        removeReaction(reaction!.id, user2.id),
      ).rejects.toThrow()
    })
  })
})
