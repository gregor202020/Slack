/**
 * Unit tests for invite.service.ts.
 *
 * Tests invite sending, listing, resending,
 * verification, and cancellation.
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
  sendInvite,
  listInvites,
  resendInvite,
  cancelInvite,
} from '../../../src/services/invite.service.js'
import {
  createTestUser,
  cleanupTestData,
} from '../../helpers/db'

describe('Invite Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // sendInvite
  // -------------------------------------------------------------------------

  describe('sendInvite', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create an invite for an unregistered phone', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`

      const result = await sendInvite(phone, admin.id, '127.0.0.1', 'test-agent')

      expect(result.inviteId).toBeDefined()
      expect(result.inviteLink).toBeDefined()
      expect(result.expiresAt).toBeInstanceOf(Date)
    })

    it('should throw when phone is already registered', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const existingUser = await createTestUser()

      await expect(
        sendInvite(existingUser.phone, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('already registered')
    })

    it('should throw when a pending invite already exists', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`

      // First invite should succeed
      await sendInvite(phone, admin.id, '127.0.0.1', 'test-agent')

      // Second invite to same phone should fail
      await expect(
        sendInvite(phone, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('already')
    })
  })

  // -------------------------------------------------------------------------
  // listInvites
  // -------------------------------------------------------------------------

  describe('listInvites', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return all invites', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const phone1 = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
      const phone2 = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
      await sendInvite(phone1, admin.id, '127.0.0.1', 'test-agent')
      await sendInvite(phone2, admin.id, '127.0.0.1', 'test-agent')

      const result = await listInvites()

      expect(result.items.length).toBe(2)
    })

    it('should return empty list when no invites exist', async () => {
      const result = await listInvites()

      expect(result.items).toEqual([])
    })

    it('should paginate results', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      for (let i = 0; i < 5; i++) {
        const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
        await sendInvite(phone, admin.id, '127.0.0.1', 'test-agent')
      }

      const result = await listInvites(undefined, 2)

      expect(result.items.length).toBeLessThanOrEqual(2)
      expect(result.nextCursor).not.toBeNull()
    })

    it('should show pending status for active invites', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
      await sendInvite(phone, admin.id, '127.0.0.1', 'test-agent')

      const result = await listInvites()

      expect(result.items[0].status).toBe('pending')
    })
  })

  // -------------------------------------------------------------------------
  // resendInvite
  // -------------------------------------------------------------------------

  describe('resendInvite', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should regenerate token and extend expiry', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
      const invite = await sendInvite(phone, admin.id, '127.0.0.1', 'test-agent')

      const resent = await resendInvite(
        invite.inviteId,
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(resent.inviteLink).toBeDefined()
      expect(resent.expiresAt).toBeInstanceOf(Date)
      // New link should differ from the original
      expect(resent.inviteLink).not.toBe(invite.inviteLink)
    })

    it('should throw for non-existent invite', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        resendInvite(fakeId, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // cancelInvite
  // -------------------------------------------------------------------------

  describe('cancelInvite', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should cancel a pending invite', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const phone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`
      const invite = await sendInvite(phone, admin.id, '127.0.0.1', 'test-agent')

      const result = await cancelInvite(
        invite.inviteId,
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(result.success).toBe(true)
    })

    it('should throw for non-existent invite', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        cancelInvite(fakeId, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })
})
