/**
 * Unit tests for user.service.ts.
 *
 * Tests user listing, profile retrieval, role management,
 * and status changes at the service layer.
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
  listUsers,
  getMe,
  getUserById,
  updateProfile,
  changeOrgRole,
  suspendUser,
  unsuspendUser,
  listUserSessions,
} from '../../../src/services/user.service.js'
import {
  createTestUser,
  createTestSession,
  createTestVenue,
  addUserToVenue,
  cleanupTestData,
} from '../../helpers/db'

describe('User Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // listUsers
  // -------------------------------------------------------------------------

  describe('listUsers', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return all active users', async () => {
      await createTestUser({ fullName: 'User A', status: 'active' })
      await createTestUser({ fullName: 'User B', status: 'active' })

      const result = await listUsers({ status: 'active' })

      expect(result.users.length).toBe(2)
    })

    it('should filter by role', async () => {
      await createTestUser({ orgRole: 'admin' })
      await createTestUser({ orgRole: 'basic' })

      const result = await listUsers({ role: 'admin' })

      expect(result.users.every((u: { orgRole: string }) => u.orgRole === 'admin')).toBe(true)
    })

    it('should filter by venue membership', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)
      await createTestUser() // not in venue

      const result = await listUsers({ venueId: venue.id })

      expect(result.users.length).toBe(1)
      expect(result.users[0].id).toBe(user.id)
    })

    it('should paginate with cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await createTestUser({ fullName: `Paginate User ${i}` })
      }

      const result = await listUsers({ limit: 2 })

      expect(result.users.length).toBeLessThanOrEqual(2)
      expect(result.nextCursor).not.toBeNull()
    })

    it('should return empty list when no users match', async () => {
      const result = await listUsers({ status: 'suspended' })

      expect(result.users).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // getMe
  // -------------------------------------------------------------------------

  describe('getMe', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return the current user profile', async () => {
      const user = await createTestUser({ fullName: 'Me User' })

      const me = await getMe(user.id)

      expect(me.id).toBe(user.id)
      expect(me.fullName).toBe('Me User')
    })

    it('should throw for non-existent user', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getMe(fakeId)).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // getUserById
  // -------------------------------------------------------------------------

  describe('getUserById', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a user by ID', async () => {
      const user = await createTestUser({ fullName: 'Get By Id User' })

      const found = await getUserById(user.id, user.id, 'basic')

      expect(found.id).toBe(user.id)
      expect(found.fullName).toBe('Get By Id User')
    })

    it('should throw for non-existent user', async () => {
      const actor = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getUserById(fakeId, actor.id, 'basic')).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // updateProfile
  // -------------------------------------------------------------------------

  describe('updateProfile', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update user full name', async () => {
      const user = await createTestUser({ fullName: 'Old Name' })

      const updated = await updateProfile(
        user.id,
        { fullName: 'New Name' },
        '127.0.0.1',
        'test-agent',
      )

      expect(updated.fullName).toBe('New Name')
    })

    it('should update user timezone', async () => {
      const user = await createTestUser()

      const updated = await updateProfile(
        user.id,
        { timezone: 'America/New_York' },
        '127.0.0.1',
        'test-agent',
      )

      expect(updated.timezone).toBe('America/New_York')
    })

    it('should throw for non-existent user', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        updateProfile(fakeId, { fullName: 'Ghost' }, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // changeOrgRole
  // -------------------------------------------------------------------------

  describe('changeOrgRole', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow super_admin to change role to admin', async () => {
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const user = await createTestUser({ orgRole: 'basic' })

      await changeOrgRole(
        user.id,
        'admin',
        superAdmin.id,
        'super_admin',
        '127.0.0.1',
        'test-agent',
      )

      const updated = await getUserById(user.id, superAdmin.id, 'super_admin')
      expect(updated.orgRole).toBe('admin')
    })

    it('should reject role change by non-admin', async () => {
      const actor = await createTestUser({ orgRole: 'basic' })
      const target = await createTestUser({ orgRole: 'basic' })

      await expect(
        changeOrgRole(
          target.id,
          'admin',
          actor.id,
          'basic',
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })

    it('should allow changing own role when actor has sufficient privileges', async () => {
      const user = await createTestUser({ orgRole: 'admin' })

      const result = await changeOrgRole(
        user.id,
        'basic',
        user.id,
        'admin',
        '127.0.0.1',
        'test-agent',
      )

      expect(result).toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // suspendUser / unsuspendUser
  // -------------------------------------------------------------------------

  describe('suspendUser', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should suspend an active user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser({ status: 'active' })

      await suspendUser(
        user.id,
        admin.id,
        'admin',
        '127.0.0.1',
        'test-agent',
      )

      const found = await getUserById(user.id, admin.id, 'admin')
      expect(found.status).toBe('suspended')
    })

    it('should throw when suspending non-existent user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        suspendUser(fakeId, admin.id, 'admin', '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  describe('unsuspendUser', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should unsuspend a suspended user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser({ status: 'suspended' })

      await unsuspendUser(
        user.id,
        admin.id,
        'admin',
        '127.0.0.1',
        'test-agent',
      )

      const found = await getUserById(user.id, admin.id, 'admin')
      expect(found.status).toBe('active')
    })
  })

  // -------------------------------------------------------------------------
  // listUserSessions
  // -------------------------------------------------------------------------

  describe('listUserSessions', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return sessions for a user', async () => {
      const user = await createTestUser()
      await createTestSession(user.id)
      await createTestSession(user.id)

      const sessions = await listUserSessions(user.id)

      expect(sessions.length).toBe(2)
    })

    it('should return empty list for user with no sessions', async () => {
      const user = await createTestUser()

      const sessions = await listUserSessions(user.id)

      expect(sessions).toEqual([])
    })
  })
})
