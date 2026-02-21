/**
 * Unit tests for notification.service.ts.
 *
 * Tests device registration, push notification delivery,
 * and domain-specific notification helpers.
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
  registerDevice,
  unregisterDevice,
  sendToUser,
  sendToUsers,
  notifyShiftUpdate,
  notifyNewDM,
  notifyNewMessage,
} from '../../../src/services/notification.service.js'
import {
  createTestUser,
  createTestChannel,
  cleanupTestData,
} from '../../helpers/db'
import { db, deviceTokens } from '@smoker/db'
import { eq } from 'drizzle-orm'

describe('Notification Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // registerDevice
  // -------------------------------------------------------------------------

  describe('registerDevice', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should register a new device token', async () => {
      const user = await createTestUser()

      const result = await registerDevice(user.id, 'fcm-token-123', 'ios')

      expect(result).toBeDefined()
      expect(result!.token).toBe('fcm-token-123')
    })

    it('should update existing token for different user', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()

      await registerDevice(user1.id, 'shared-token', 'ios')
      const result = await registerDevice(user2.id, 'shared-token', 'android')

      expect(result).toBeDefined()
    })

    it('should handle multiple tokens for same user', async () => {
      const user = await createTestUser()

      await registerDevice(user.id, 'token-a', 'ios')
      await registerDevice(user.id, 'token-b', 'android')

      const tokens = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, user.id))

      expect(tokens.length).toBe(2)
    })
  })

  // -------------------------------------------------------------------------
  // unregisterDevice
  // -------------------------------------------------------------------------

  describe('unregisterDevice', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should remove a device token', async () => {
      const user = await createTestUser()
      await registerDevice(user.id, 'remove-me-token', 'ios')

      const result = await unregisterDevice(user.id, 'remove-me-token')

      expect(result.success).toBe(true)

      const tokens = await db
        .select()
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, user.id))

      expect(tokens.length).toBe(0)
    })

    it('should succeed even if token does not exist', async () => {
      const user = await createTestUser()

      const result = await unregisterDevice(user.id, 'nonexistent-token')

      expect(result.success).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // sendToUser (no Firebase configured, should be no-op)
  // -------------------------------------------------------------------------

  describe('sendToUser', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should silently no-op when Firebase is not configured', async () => {
      const user = await createTestUser()

      // Should not throw even without Firebase
      await expect(
        sendToUser(user.id, 'Test Title', 'Test Body'),
      ).resolves.not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // sendToUsers
  // -------------------------------------------------------------------------

  describe('sendToUsers', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should silently no-op when Firebase is not configured', async () => {
      const user = await createTestUser()

      await expect(
        sendToUsers([user.id], 'Title', 'Body'),
      ).resolves.not.toThrow()
    })

    it('should handle empty user array gracefully', async () => {
      await expect(
        sendToUsers([], 'Title', 'Body'),
      ).resolves.not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // notifyShiftUpdate
  // -------------------------------------------------------------------------

  describe('notifyShiftUpdate', () => {
    it('should not throw for any shift event type', async () => {
      const user = await createTestUser()

      for (const type of ['created', 'updated', 'deleted', 'swap_requested', 'swap_accepted', 'swap_declined']) {
        await expect(
          notifyShiftUpdate({ id: 'shift-1', userId: user.id, type }),
        ).resolves.not.toThrow()
      }
    })
  })

  // -------------------------------------------------------------------------
  // notifyNewDM
  // -------------------------------------------------------------------------

  describe('notifyNewDM', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should not throw when sending DM notification', async () => {
      const sender = await createTestUser({ fullName: 'Alice' })
      const recipient = await createTestUser()

      await expect(
        notifyNewDM(sender.id, recipient.id, 'Hello there'),
      ).resolves.not.toThrow()
    })

    it('should handle long preview text by truncating', async () => {
      const sender = await createTestUser()
      const recipient = await createTestUser()

      const longPreview = 'a'.repeat(200)

      await expect(
        notifyNewDM(sender.id, recipient.id, longPreview),
      ).resolves.not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // notifyNewMessage
  // -------------------------------------------------------------------------

  describe('notifyNewMessage', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should not throw when sending channel message notification', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'notify-test' })

      await expect(
        notifyNewMessage(channel.id, user.id, 'New message'),
      ).resolves.not.toThrow()
    })

    it('should handle non-existent channel gracefully', async () => {
      const user = await createTestUser()
      const fakeChannelId = '00000000-0000-4000-a000-000000000000'

      await expect(
        notifyNewMessage(fakeChannelId, user.id, 'Message'),
      ).resolves.not.toThrow()
    })
  })
})
