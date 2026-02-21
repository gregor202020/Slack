/**
 * Unit tests for pin.service.ts.
 *
 * Tests pinning, unpinning, and listing pinned messages.
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
  pinMessage,
  unpinMessage,
  listPinnedMessages,
} from '../../../src/services/pin.service.js'
import { emitToChannel } from '../../../src/plugins/socket.js'
import {
  createTestUser,
  createTestChannel,
  createTestMessage,
  cleanupTestData,
} from '../../helpers/db'

describe('Pin Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // pinMessage
  // -------------------------------------------------------------------------

  describe('pinMessage', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should pin a message in a channel', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Pin me',
      })

      const pin = await pinMessage(channel.id, message.id, user.id)

      expect(pin).toBeDefined()
      expect(pin!.channelId).toBe(channel.id)
      expect(pin!.messageId).toBe(message.id)
      expect(pin!.pinnedBy).toBe(user.id)
    })

    it('should emit pin:added socket event', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Pin event test',
      })

      await pinMessage(channel.id, message.id, user.id)

      expect(emitToChannel).toHaveBeenCalledWith(
        channel.id,
        'pin:added',
        expect.objectContaining({
          channelId: channel.id,
          messageId: message.id,
          pinnedBy: user.id,
        }),
      )
    })

    it('should throw when message does not exist', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const fakeMessageId = '00000000-0000-4000-a000-000000000000'

      await expect(
        pinMessage(channel.id, fakeMessageId, user.id),
      ).rejects.toThrow('not found')
    })

    it('should throw when message is already pinned', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Double pin',
      })

      await pinMessage(channel.id, message.id, user.id)

      await expect(
        pinMessage(channel.id, message.id, user.id),
      ).rejects.toThrow('already pinned')
    })

    it('should throw when message belongs to a different channel', async () => {
      const user = await createTestUser()
      const channel1 = await createTestChannel({ name: 'pin-ch1' })
      const channel2 = await createTestChannel({ name: 'pin-ch2' })
      const message = await createTestMessage({
        channelId: channel1.id,
        userId: user.id,
        body: 'Wrong channel',
      })

      await expect(
        pinMessage(channel2.id, message.id, user.id),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // unpinMessage
  // -------------------------------------------------------------------------

  describe('unpinMessage', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should unpin a pinned message', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Unpin me',
      })
      await pinMessage(channel.id, message.id, user.id)

      const result = await unpinMessage(channel.id, message.id, user.id)

      expect(result.success).toBe(true)
    })

    it('should emit pin:removed socket event', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Unpin event test',
      })
      await pinMessage(channel.id, message.id, user.id)

      await unpinMessage(channel.id, message.id, user.id)

      expect(emitToChannel).toHaveBeenCalledWith(
        channel.id,
        'pin:removed',
        expect.objectContaining({
          channelId: channel.id,
          messageId: message.id,
        }),
      )
    })

    it('should throw when pin does not exist', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const fakeMessageId = '00000000-0000-4000-a000-000000000000'

      await expect(
        unpinMessage(channel.id, fakeMessageId, user.id),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // listPinnedMessages
  // -------------------------------------------------------------------------

  describe('listPinnedMessages', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return all pinned messages for a channel', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const msg1 = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Pinned 1',
      })
      const msg2 = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Pinned 2',
      })
      await pinMessage(channel.id, msg1.id, user.id)
      await pinMessage(channel.id, msg2.id, user.id)

      const pins = await listPinnedMessages(channel.id)

      expect(pins.length).toBe(2)
      expect(pins[0].message).toBeDefined()
      expect(pins[0].pinnerName).toBeDefined()
    })

    it('should return empty list for channel with no pins', async () => {
      const channel = await createTestChannel()

      const pins = await listPinnedMessages(channel.id)

      expect(pins).toEqual([])
    })
  })
})
