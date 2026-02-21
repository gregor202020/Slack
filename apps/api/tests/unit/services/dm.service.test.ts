/**
 * Unit tests for dm.service.ts.
 *
 * Tests DM creation, listing, message retrieval,
 * membership management, and dissolution.
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
  createDm,
  listDms,
  getDmById,
  getDmMessages,
  listDmMembers,
  addDmMembers,
  leaveDm,
} from '../../../src/services/dm.service.js'
import {
  createTestUser,
  createTestDm,
  createTestMessage,
  cleanupTestData,
} from '../../helpers/db'

describe('DM Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // createDm
  // -------------------------------------------------------------------------

  describe('createDm', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a direct DM between two users', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()

      const dm = await createDm(
        { type: 'direct', memberIds: [user1.id, user2.id] },
        user1.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(dm).toBeDefined()
      expect(dm.type).toBe('direct')
      expect(dm.members.length).toBe(2)
    })

    it('should create a group DM with multiple users', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const user3 = await createTestUser()

      const dm = await createDm(
        { type: 'group', memberIds: [user1.id, user2.id, user3.id] },
        user1.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(dm.type).toBe('group')
      expect(dm.members.length).toBe(3)
    })

    it('should return existing DM when recreating with same pair', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()

      const dm1 = await createDm(
        { type: 'direct', memberIds: [user1.id, user2.id] },
        user1.id,
        '127.0.0.1',
        'test-agent',
      )

      const dm2 = await createDm(
        { type: 'direct', memberIds: [user1.id, user2.id] },
        user1.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(dm1.id).toBe(dm2.id)
    })

    it('should reject direct DM with only one member', async () => {
      const user1 = await createTestUser()

      await expect(
        createDm(
          { type: 'direct', memberIds: [user1.id] },
          user1.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })

    it('should reject direct DM with more than two members', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const user3 = await createTestUser()

      await expect(
        createDm(
          { type: 'direct', memberIds: [user1.id, user2.id, user3.id] },
          user1.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // listDms
  // -------------------------------------------------------------------------

  describe('listDms', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return DMs for a user', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      await createTestDm('direct', [user1.id, user2.id])

      const result = await listDms(user1.id)

      expect(result.dms.length).toBe(1)
    })

    it('should return empty list when user has no DMs', async () => {
      const user = await createTestUser()

      const result = await listDms(user.id)

      expect(result.dms).toEqual([])
    })

    it('should paginate results', async () => {
      const user = await createTestUser()
      const others = await Promise.all(
        Array.from({ length: 5 }, () => createTestUser()),
      )

      for (const other of others) {
        await createTestDm('direct', [user.id, other.id])
      }

      const result = await listDms(user.id, undefined, 2)

      expect(result.dms.length).toBeLessThanOrEqual(2)
    })
  })

  // -------------------------------------------------------------------------
  // getDmById
  // -------------------------------------------------------------------------

  describe('getDmById', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a DM by its ID', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const dm = await createTestDm('direct', [user1.id, user2.id])

      const found = await getDmById(dm.id)

      expect(found).toBeDefined()
      expect(found.id).toBe(dm.id)
    })

    it('should throw for non-existent DM', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getDmById(fakeId)).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // getDmMessages
  // -------------------------------------------------------------------------

  describe('getDmMessages', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return messages for a DM', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const dm = await createTestDm('direct', [user1.id, user2.id])
      await createTestMessage({ dmId: dm.id, userId: user1.id, body: 'Hello' })

      const result = await getDmMessages(dm.id)

      expect(result.messages.length).toBe(1)
      expect(result.messages[0].body).toBe('Hello')
    })

    it('should return empty list when DM has no messages', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const dm = await createTestDm('direct', [user1.id, user2.id])

      const result = await getDmMessages(dm.id)

      expect(result.messages).toEqual([])
    })

    it('should not return deleted messages', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const dm = await createTestDm('direct', [user1.id, user2.id])
      await createTestMessage({ dmId: dm.id, userId: user1.id, body: 'Visible' })
      await createTestMessage({
        dmId: dm.id,
        userId: user1.id,
        body: 'Deleted',
        deletedAt: new Date(),
      })

      const result = await getDmMessages(dm.id)

      expect(result.messages.length).toBe(1)
      expect(result.messages[0].body).toBe('Visible')
    })
  })

  // -------------------------------------------------------------------------
  // listDmMembers
  // -------------------------------------------------------------------------

  describe('listDmMembers', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return members of a DM', async () => {
      const user1 = await createTestUser({ fullName: 'Alice' })
      const user2 = await createTestUser({ fullName: 'Bob' })
      const dm = await createTestDm('direct', [user1.id, user2.id])

      const members = await listDmMembers(dm.id)

      expect(members.length).toBe(2)
    })
  })

  // -------------------------------------------------------------------------
  // addDmMembers (group DMs only)
  // -------------------------------------------------------------------------

  describe('addDmMembers', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should add a member to a group DM', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const user3 = await createTestUser()
      const dm = await createTestDm('group', [user1.id, user2.id])

      await addDmMembers(
        dm.id,
        [user3.id],
        user1.id,
        '127.0.0.1',
        'test-agent',
      )

      const members = await listDmMembers(dm.id)
      expect(members.length).toBe(3)
    })

    it('should reject adding members to a direct DM', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const user3 = await createTestUser()
      const dm = await createTestDm('direct', [user1.id, user2.id])

      await expect(
        addDmMembers(
          dm.id,
          [user3.id],
          user1.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // leaveDm
  // -------------------------------------------------------------------------

  describe('leaveDm', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow leaving a group DM', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const user3 = await createTestUser()
      const dm = await createTestDm('group', [user1.id, user2.id, user3.id])

      await leaveDm(dm.id, user3.id)

      const members = await listDmMembers(dm.id)
      expect(members.length).toBe(2)
    })
  })
})
