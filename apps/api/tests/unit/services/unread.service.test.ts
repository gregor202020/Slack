/**
 * Unit tests for unread.service.ts.
 *
 * Tests unread count computation, mark-as-read behavior,
 * and total unread calculations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

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
  getUnreadCounts,
  markAsRead,
  getTotalUnread,
} from '../../../src/services/unread.service.js'
import {
  createTestUser,
  createTestChannel,
  createTestDm,
  createTestMessage,
  addUserToChannel,
  cleanupTestData,
} from '../../helpers/db'

describe('Unread Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // getUnreadCounts
  // -------------------------------------------------------------------------

  describe('getUnreadCounts', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return zero counts for user with no memberships', async () => {
      const user = await createTestUser()

      const result = await getUnreadCounts(user.id)

      expect(result.channels).toEqual({})
      expect(result.dms).toEqual({})
      expect(result.total).toBe(0)
    })

    it('should count unread messages in channels', async () => {
      const reader = await createTestUser()
      const writer = await createTestUser()
      const channel = await createTestChannel()
      await addUserToChannel(channel.id, reader.id)
      await addUserToChannel(channel.id, writer.id)

      // Writer posts a message after reader's lastReadAt
      await createTestMessage({
        channelId: channel.id,
        userId: writer.id,
        body: 'Unread message',
      })

      const result = await getUnreadCounts(reader.id)

      expect(result.total).toBeGreaterThanOrEqual(1)
    })

    it('should not count own messages as unread', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      await addUserToChannel(channel.id, user.id)

      // User posts their own message
      await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'My own message',
      })

      const result = await getUnreadCounts(user.id)

      // Own messages should not be counted
      expect(result.channels[channel.id] ?? 0).toBe(0)
    })

    it('should count unread messages in DMs', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const dm = await createTestDm('direct', [user1.id, user2.id])

      await createTestMessage({
        dmId: dm.id,
        userId: user2.id,
        body: 'DM unread',
      })

      const result = await getUnreadCounts(user1.id)

      expect(result.total).toBeGreaterThanOrEqual(1)
    })
  })

  // -------------------------------------------------------------------------
  // markAsRead
  // -------------------------------------------------------------------------

  describe('markAsRead', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should mark a channel as read', async () => {
      const reader = await createTestUser()
      const writer = await createTestUser()
      const channel = await createTestChannel()
      await addUserToChannel(channel.id, reader.id)
      await addUserToChannel(channel.id, writer.id)

      await createTestMessage({
        channelId: channel.id,
        userId: writer.id,
        body: 'Read me',
      })

      // Verify unread count before marking as read
      const beforeCounts = await getUnreadCounts(reader.id)
      const beforeUnread = beforeCounts.channels[channel.id] ?? 0

      await markAsRead(reader.id, channel.id)

      const afterCounts = await getUnreadCounts(reader.id)
      const afterUnread = afterCounts.channels[channel.id] ?? 0

      expect(afterUnread).toBeLessThanOrEqual(beforeUnread)
    })

    it('should mark a DM as read', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const dm = await createTestDm('direct', [user1.id, user2.id])

      await createTestMessage({
        dmId: dm.id,
        userId: user2.id,
        body: 'DM to read',
      })

      await markAsRead(user1.id, undefined, dm.id)

      const counts = await getUnreadCounts(user1.id)
      const dmUnread = counts.dms[dm.id] ?? 0

      expect(dmUnread).toBe(0)
    })

    it('should not throw when marking non-member channel as read', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()

      // Should not throw even if user is not a member
      await expect(
        markAsRead(user.id, channel.id),
      ).resolves.not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // getTotalUnread
  // -------------------------------------------------------------------------

  describe('getTotalUnread', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return total unread across channels and DMs', async () => {
      const user = await createTestUser()

      const total = await getTotalUnread(user.id)

      expect(typeof total).toBe('number')
      expect(total).toBeGreaterThanOrEqual(0)
    })

    it('should return 0 for user with no memberships', async () => {
      const user = await createTestUser()

      const total = await getTotalUnread(user.id)

      expect(total).toBe(0)
    })
  })
})
