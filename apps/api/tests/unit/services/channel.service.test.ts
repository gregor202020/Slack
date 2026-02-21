/**
 * Unit tests for channel.service.ts.
 *
 * Tests channel CRUD, membership management, archiving,
 * and access control at the service layer.
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
  createChannel,
  getChannelById,
  listChannels,
  updateChannel,
  archiveChannel,
  addChannelMembers,
  removeChannelMember,
  listChannelMembers,
  joinChannel,
  leaveChannel,
} from '../../../src/services/channel.service.js'
import {
  createTestUser,
  createTestChannel,
  addUserToChannel,
  cleanupTestData,
} from '../../helpers/db'

describe('Channel Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // createChannel
  // -------------------------------------------------------------------------

  describe('createChannel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a public channel and add creator as member', async () => {
      const user = await createTestUser()

      const channel = await createChannel(
        { name: 'test-public', type: 'public', scope: 'org' },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(channel).toBeDefined()
      expect(channel.name).toBe('test-public')
      expect(channel.type).toBe('public')
      expect(channel.scope).toBe('org')
      expect(channel.ownerUserId).toBe(user.id)
    })

    it('should create a private channel', async () => {
      const user = await createTestUser()

      const channel = await createChannel(
        { name: 'test-private', type: 'private', scope: 'org' },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(channel.type).toBe('private')
    })

    it('should throw when venue-scoped channel has no venueId', async () => {
      const user = await createTestUser()

      await expect(
        createChannel(
          { name: 'no-venue', type: 'public', scope: 'venue' },
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('venueId is required')
    })
  })

  // -------------------------------------------------------------------------
  // getChannelById
  // -------------------------------------------------------------------------

  describe('getChannelById', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a channel by ID with member count', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'get-by-id-test' })
      await addUserToChannel(channel.id, user.id)

      const found = await getChannelById(channel.id)

      expect(found.id).toBe(channel.id)
      expect(found.name).toBe('get-by-id-test')
      expect(found.memberCount).toBe(1)
    })

    it('should throw for non-existent channel', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getChannelById(fakeId)).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // listChannels
  // -------------------------------------------------------------------------

  describe('listChannels', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return public channels for basic users', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      await createTestChannel({ name: 'public-visible', type: 'public' })

      const result = await listChannels(user.id, 'basic')

      expect(result.channels.length).toBeGreaterThanOrEqual(1)
    })

    it('should allow admin to see all channels including private', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      await createTestChannel({ name: 'private-admin-visible', type: 'private' })

      const result = await listChannels(admin.id, 'admin')

      expect(result.channels.length).toBeGreaterThanOrEqual(1)
    })

    it('should not show private channels to non-members', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      await createTestChannel({ name: 'private-hidden', type: 'private' })

      const result = await listChannels(user.id, 'basic')

      const found = result.channels.find((c: { name: string }) => c.name === 'private-hidden')
      expect(found).toBeUndefined()
    })

    it('should show private channels to members', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const channel = await createTestChannel({ name: 'private-member-visible', type: 'private' })
      await addUserToChannel(channel.id, user.id)

      const result = await listChannels(user.id, 'basic')

      const found = result.channels.find((c: { name: string }) => c.name === 'private-member-visible')
      expect(found).toBeDefined()
    })

    it('should paginate results', async () => {
      const user = await createTestUser({ orgRole: 'admin' })
      for (let i = 0; i < 5; i++) {
        await createTestChannel({ name: `paginate-${i}`, type: 'public' })
      }

      const result = await listChannels(user.id, 'admin', { limit: 2 })

      expect(result.channels.length).toBeLessThanOrEqual(2)
      expect(result.nextCursor).not.toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // updateChannel
  // -------------------------------------------------------------------------

  describe('updateChannel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow the owner to update the channel', async () => {
      const user = await createTestUser()
      const channel = await createChannel(
        { name: 'update-test', type: 'public', scope: 'org' },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      const updated = await updateChannel(
        channel.id,
        { topic: 'New Topic' },
        user.id,
        'basic',
        '127.0.0.1',
        'test-agent',
      )

      expect(updated.topic).toBe('New Topic')
    })

    it('should allow admin to update any channel', async () => {
      const owner = await createTestUser()
      const admin = await createTestUser({ orgRole: 'admin' })
      const channel = await createChannel(
        { name: 'admin-update', type: 'public', scope: 'org' },
        owner.id,
        '127.0.0.1',
        'test-agent',
      )

      const updated = await updateChannel(
        channel.id,
        { topic: 'Admin Override' },
        admin.id,
        'admin',
        '127.0.0.1',
        'test-agent',
      )

      expect(updated.topic).toBe('Admin Override')
    })

    it('should reject update by non-owner non-admin', async () => {
      const owner = await createTestUser()
      const other = await createTestUser()
      const channel = await createChannel(
        { name: 'no-update', type: 'public', scope: 'org' },
        owner.id,
        '127.0.0.1',
        'test-agent',
      )

      await expect(
        updateChannel(
          channel.id,
          { topic: 'Hacked' },
          other.id,
          'basic',
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })

    it('should throw for non-existent channel', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        updateChannel(
          fakeId,
          { topic: 'Ghost' },
          user.id,
          'admin',
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // archiveChannel
  // -------------------------------------------------------------------------

  describe('archiveChannel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should archive a channel', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'archive-test' })

      await archiveChannel(channel.id, user.id, '127.0.0.1', 'test-agent')

      const found = await getChannelById(channel.id)
      expect(found.status).toBe('archived')
    })

    it('should throw for non-existent channel', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        archiveChannel(fakeId, user.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // addChannelMembers / removeChannelMember
  // -------------------------------------------------------------------------

  describe('addChannelMembers', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should add members to a channel', async () => {
      const actor = await createTestUser()
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const channel = await createTestChannel({ name: 'add-members-test' })

      await addChannelMembers(
        channel.id,
        [user1.id, user2.id],
        actor.id,
        '127.0.0.1',
        'test-agent',
      )

      const members = await listChannelMembers(channel.id)
      expect(members.members.length).toBe(2)
    })

    it('should throw when adding to archived channel', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'archived-add', status: 'archived' })

      await expect(
        addChannelMembers(
          channel.id,
          [user.id],
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })

    it('should throw for non-existent channel', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        addChannelMembers(
          fakeId,
          [user.id],
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })
  })

  describe('removeChannelMember', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should remove a member from a channel', async () => {
      const actor = await createTestUser()
      const member = await createTestUser()
      const channel = await createTestChannel({ name: 'remove-member-test' })
      await addUserToChannel(channel.id, member.id)

      await removeChannelMember(
        channel.id,
        member.id,
        actor.id,
        '127.0.0.1',
        'test-agent',
      )

      const members = await listChannelMembers(channel.id)
      const found = members.members.find((m: { userId: string }) => m.userId === member.id)
      expect(found).toBeUndefined()
    })

    it('should throw when removing from mandatory channel', async () => {
      const actor = await createTestUser()
      const member = await createTestUser()
      const channel = await createTestChannel({
        name: 'mandatory-remove',
        isMandatory: true,
      })
      await addUserToChannel(channel.id, member.id)

      await expect(
        removeChannelMember(
          channel.id,
          member.id,
          actor.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('mandatory')
    })
  })

  // -------------------------------------------------------------------------
  // listChannelMembers
  // -------------------------------------------------------------------------

  describe('listChannelMembers', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return an empty list for a channel with no members', async () => {
      const channel = await createTestChannel({ name: 'empty-members' })

      const result = await listChannelMembers(channel.id)

      expect(result.members).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // joinChannel / leaveChannel
  // -------------------------------------------------------------------------

  describe('joinChannel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow joining a public channel', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'join-public', type: 'public' })

      await joinChannel(channel.id, user.id)

      const members = await listChannelMembers(channel.id)
      const found = members.members.find((m: { userId: string }) => m.userId === user.id)
      expect(found).toBeDefined()
    })

    it('should reject joining a private channel directly', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'join-private', type: 'private' })

      await expect(joinChannel(channel.id, user.id)).rejects.toThrow()
    })
  })

  describe('leaveChannel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow leaving a non-mandatory channel', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({ name: 'leave-test' })
      await addUserToChannel(channel.id, user.id)

      await leaveChannel(channel.id, user.id)

      const members = await listChannelMembers(channel.id)
      const found = members.members.find((m: { userId: string }) => m.userId === user.id)
      expect(found).toBeUndefined()
    })

    it('should reject leaving a mandatory channel', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel({
        name: 'mandatory-leave',
        isMandatory: true,
      })
      await addUserToChannel(channel.id, user.id)

      await expect(leaveChannel(channel.id, user.id)).rejects.toThrow('mandatory')
    })
  })
})
