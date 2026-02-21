/**
 * Unit tests for announcement.service.ts.
 *
 * Tests announcement CRUD, acknowledgement tracking,
 * scope validation, and locking behavior.
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
  listAnnouncements,
  createAnnouncement,
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  acknowledgeAnnouncement,
  getAckDashboard,
  getPendingAnnouncements,
} from '../../../src/services/announcement.service.js'
import {
  createTestUser,
  createTestVenue,
  createTestChannel,
  createTestAnnouncement,
  cleanupTestData,
} from '../../helpers/db'

describe('Announcement Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // createAnnouncement
  // -------------------------------------------------------------------------

  describe('createAnnouncement', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a system-scoped announcement', async () => {
      const user = await createTestUser({ orgRole: 'admin' })

      const announcement = await createAnnouncement(
        {
          scope: 'system',
          title: 'System Update',
          body: 'A system update is happening.',
          ackRequired: false,
        },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(announcement).toBeDefined()
      expect(announcement.scope).toBe('system')
      expect(announcement.title).toBe('System Update')
    })

    it('should create a venue-scoped announcement', async () => {
      const user = await createTestUser({ orgRole: 'admin' })
      const venue = await createTestVenue()

      const announcement = await createAnnouncement(
        {
          scope: 'venue',
          venueId: venue.id,
          title: 'Venue News',
          body: 'Something about this venue.',
          ackRequired: false,
        },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(announcement.scope).toBe('venue')
      expect(announcement.venueId).toBe(venue.id)
    })

    it('should throw when system scope has venueId', async () => {
      const user = await createTestUser({ orgRole: 'admin' })
      const venue = await createTestVenue()

      await expect(
        createAnnouncement(
          {
            scope: 'system',
            venueId: venue.id,
            title: 'Invalid',
            body: 'Invalid scope.',
            ackRequired: false,
          },
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('must not have')
    })

    it('should throw when venue scope lacks venueId', async () => {
      const user = await createTestUser({ orgRole: 'admin' })

      await expect(
        createAnnouncement(
          {
            scope: 'venue',
            title: 'No Venue',
            body: 'Missing venue ID.',
            ackRequired: false,
          },
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('venueId is required')
    })

    it('should throw when channel scope lacks channelId', async () => {
      const user = await createTestUser({ orgRole: 'admin' })

      await expect(
        createAnnouncement(
          {
            scope: 'channel',
            title: 'No Channel',
            body: 'Missing channel ID.',
            ackRequired: false,
          },
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('channelId is required')
    })
  })

  // -------------------------------------------------------------------------
  // getAnnouncement
  // -------------------------------------------------------------------------

  describe('getAnnouncement', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return an announcement by ID', async () => {
      const user = await createTestUser()
      const ann = await createTestAnnouncement({
        userId: user.id,
        title: 'Find Me',
      })

      const found = await getAnnouncement(ann.id, user.id)

      expect(found.id).toBe(ann.id)
      expect(found.title).toBe('Find Me')
      expect(found.userAckedAt).toBeNull()
    })

    it('should throw for non-existent announcement', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getAnnouncement(fakeId, user.id)).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // listAnnouncements
  // -------------------------------------------------------------------------

  describe('listAnnouncements', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return all announcements', async () => {
      const user = await createTestUser()
      await createTestAnnouncement({ userId: user.id, title: 'Ann 1' })
      await createTestAnnouncement({ userId: user.id, title: 'Ann 2' })

      const result = await listAnnouncements(user.id, 'admin')

      expect(result.announcements.length).toBe(2)
    })

    it('should paginate announcements', async () => {
      const user = await createTestUser()
      for (let i = 0; i < 5; i++) {
        await createTestAnnouncement({ userId: user.id, title: `Paginate ${i}` })
      }

      const result = await listAnnouncements(user.id, 'admin', { limit: 2 })

      expect(result.announcements.length).toBeLessThanOrEqual(2)
      expect(result.nextCursor).not.toBeNull()
    })

    it('should filter by scope', async () => {
      const user = await createTestUser()
      await createTestAnnouncement({ userId: user.id, scope: 'system', title: 'System' })

      const result = await listAnnouncements(user.id, 'admin', { scope: 'system' })

      expect(result.announcements.every((a: { scope: string }) => a.scope === 'system')).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // updateAnnouncement
  // -------------------------------------------------------------------------

  describe('updateAnnouncement', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update announcement title and body', async () => {
      const user = await createTestUser()
      const ann = await createTestAnnouncement({
        userId: user.id,
        title: 'Old Title',
        body: 'Old Body',
      })

      const updated = await updateAnnouncement(
        ann.id,
        { title: 'New Title', body: 'New Body' },
        user.id,
        'admin',
        '127.0.0.1',
        'test-agent',
      )

      expect(updated!.title).toBe('New Title')
    })

    it('should reject update by non-creator non-admin', async () => {
      const creator = await createTestUser()
      const other = await createTestUser()
      const ann = await createTestAnnouncement({
        userId: creator.id,
        title: 'Creator Only',
      })

      await expect(
        updateAnnouncement(
          ann.id,
          { title: 'Hacked' },
          other.id,
          'basic',
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })

    it('should throw for non-existent announcement', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        updateAnnouncement(
          fakeId,
          { title: 'Ghost' },
          user.id,
          'admin',
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // deleteAnnouncement
  // -------------------------------------------------------------------------

  describe('deleteAnnouncement', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should soft-delete an announcement', async () => {
      const user = await createTestUser()
      const ann = await createTestAnnouncement({
        userId: user.id,
        title: 'Delete Me',
      })

      const result = await deleteAnnouncement(
        ann.id,
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(result.success).toBe(true)
    })

    it('should throw for non-existent announcement', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        deleteAnnouncement(fakeId, user.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // acknowledgeAnnouncement
  // -------------------------------------------------------------------------

  describe('acknowledgeAnnouncement', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should acknowledge an announcement', async () => {
      const user = await createTestUser()
      const ann = await createTestAnnouncement({
        userId: user.id,
        ackRequired: true,
      })

      const result = await acknowledgeAnnouncement(
        ann.id,
        user.id,
        'session-123',
        '127.0.0.1',
        'test-agent',
      )

      expect(result.success).toBe(true)
    })

    it('should be idempotent (acking twice succeeds)', async () => {
      const user = await createTestUser()
      const ann = await createTestAnnouncement({
        userId: user.id,
        ackRequired: true,
      })

      await acknowledgeAnnouncement(ann.id, user.id, 's1', '127.0.0.1', 'test-agent')
      const result = await acknowledgeAnnouncement(ann.id, user.id, 's2', '127.0.0.1', 'test-agent')

      expect(result.success).toBe(true)
    })

    it('should throw for non-existent announcement', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        acknowledgeAnnouncement(fakeId, user.id, 's1', '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // getAckDashboard
  // -------------------------------------------------------------------------

  describe('getAckDashboard', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return ack dashboard data', async () => {
      const user = await createTestUser()
      const ann = await createTestAnnouncement({
        userId: user.id,
        ackRequired: true,
      })

      const dashboard = await getAckDashboard(ann.id)

      expect(dashboard).toBeDefined()
      expect(typeof dashboard.totalRequired).toBe('number')
      expect(typeof dashboard.acked).toBe('number')
      expect(typeof dashboard.pending).toBe('number')
    })

    it('should throw for non-existent announcement', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getAckDashboard(fakeId)).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // getPendingAnnouncements
  // -------------------------------------------------------------------------

  describe('getPendingAnnouncements', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return announcements user has not acknowledged', async () => {
      const author = await createTestUser()
      await createTestAnnouncement({
        userId: author.id,
        ackRequired: true,
        title: 'Pending Ack',
      })

      const pending = await getPendingAnnouncements(author.id)

      // At least one pending announcement (the one we just created)
      expect(pending.length).toBeGreaterThanOrEqual(1)
    })

    it('should not return already-acked announcements', async () => {
      const user = await createTestUser()
      const ann = await createTestAnnouncement({
        userId: user.id,
        ackRequired: true,
      })

      await acknowledgeAnnouncement(ann.id, user.id, 's1', '127.0.0.1', 'test-agent')

      const pending = await getPendingAnnouncements(user.id)
      const found = pending.find((a: { id: string }) => a.id === ann.id)
      expect(found).toBeUndefined()
    })
  })
})
