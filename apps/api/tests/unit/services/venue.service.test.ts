/**
 * Unit tests for venue.service.ts.
 *
 * Tests venue CRUD, membership management, archiving,
 * channel listing, and position management.
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
  listVenues,
  createVenue,
  getVenueById,
  updateVenue,
  archiveVenue,
  unarchiveVenue,
  listVenueMembers,
  addVenueMember,
  removeVenueMember,
  listVenueChannels,
  listPositions,
  createPosition,
  deletePosition,
} from '../../../src/services/venue.service.js'
import {
  createTestUser,
  createTestVenue,
  addUserToVenue,
  cleanupTestData,
} from '../../helpers/db'

describe('Venue Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // createVenue
  // -------------------------------------------------------------------------

  describe('createVenue', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a venue and add creator as admin', async () => {
      const user = await createTestUser()

      const venue = await createVenue(
        { name: 'Test Bar', address: '123 Main St' },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(venue).toBeDefined()
      expect(venue.name).toBe('Test Bar')
    })

    it('should create default channels for new venue', async () => {
      const user = await createTestUser()

      const venue = await createVenue(
        { name: 'Channel Venue', address: '456 Elm St' },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      const venueChannels = await listVenueChannels(venue.id)

      // Should have 3 default channels: general, announcements, random
      expect(venueChannels.length).toBe(3)
    })
  })

  // -------------------------------------------------------------------------
  // listVenues
  // -------------------------------------------------------------------------

  describe('listVenues', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return all venues for admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      await createTestVenue({ name: 'V1' })
      await createTestVenue({ name: 'V2' })

      const result = await listVenues(admin.id, 'admin')

      expect(result.length).toBe(2)
    })

    it('should only return user venues for non-admin', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const venue = await createTestVenue({ name: 'My Venue' })
      await createTestVenue({ name: 'Not My Venue' })
      await addUserToVenue(user.id, venue.id)

      const result = await listVenues(user.id, 'basic')

      expect(result.length).toBe(1)
      expect(result[0].name).toBe('My Venue')
    })
  })

  // -------------------------------------------------------------------------
  // getVenueById
  // -------------------------------------------------------------------------

  describe('getVenueById', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return venue details with members', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const venue = await createTestVenue()

      const found = await getVenueById(venue.id, admin.id, 'admin')

      expect(found.id).toBe(venue.id)
      expect(found.members).toBeDefined()
    })

    it('should throw for non-existent venue', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        getVenueById(fakeId, user.id, 'basic'),
      ).rejects.toThrow('not found')
    })

    it('should throw for non-member non-admin', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const venue = await createTestVenue()

      await expect(
        getVenueById(venue.id, user.id, 'basic'),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // updateVenue
  // -------------------------------------------------------------------------

  describe('updateVenue', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update venue name', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue({ name: 'Old Name' })

      const updated = await updateVenue(
        venue.id,
        { name: 'New Name' },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(updated!.name).toBe('New Name')
    })

    it('should throw for non-existent venue', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        updateVenue(fakeId, { name: 'Ghost' }, user.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not found')
    })

    it('should throw when updating archived venue', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue({ status: 'archived' })

      await expect(
        updateVenue(venue.id, { name: 'Cannot' }, user.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // archiveVenue / unarchiveVenue
  // -------------------------------------------------------------------------

  describe('archiveVenue', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should archive a venue', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const venue = await createTestVenue()

      await archiveVenue(venue.id, admin.id, '127.0.0.1', 'test-agent')

      const found = await getVenueById(venue.id, admin.id, 'admin')
      expect(found.status).toBe('archived')
    })

    it('should throw for non-existent venue', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        archiveVenue(fakeId, user.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not found')
    })
  })

  describe('unarchiveVenue', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should unarchive a venue', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const venue = await createTestVenue({ status: 'archived' })

      await unarchiveVenue(venue.id, admin.id, '127.0.0.1', 'test-agent')

      const found = await getVenueById(venue.id, admin.id, 'admin')
      expect(found.status).toBe('active')
    })
  })

  // -------------------------------------------------------------------------
  // addVenueMember / removeVenueMember / listVenueMembers
  // -------------------------------------------------------------------------

  describe('addVenueMember', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should add a member to a venue', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser()
      const venue = await createTestVenue()

      await addVenueMember(
        venue.id,
        user.id,
        'basic',
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      const members = await listVenueMembers(venue.id)
      expect(members.members.length).toBe(1)
    })

    it('should throw when user is already a member', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)

      await expect(
        addVenueMember(venue.id, user.id, 'basic', admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('already a member')
    })

    it('should throw for archived venue', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser()
      const venue = await createTestVenue({ status: 'archived' })

      await expect(
        addVenueMember(venue.id, user.id, 'basic', admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  describe('removeVenueMember', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should remove a member from a venue', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser()
      const venue1 = await createTestVenue({ name: 'V1' })
      const venue2 = await createTestVenue({ name: 'V2' })
      await addUserToVenue(user.id, venue1.id)
      await addUserToVenue(user.id, venue2.id) // needs at least one other

      await removeVenueMember(
        venue1.id,
        user.id,
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      const members = await listVenueMembers(venue1.id)
      const found = members.members.find((m: { userId: string }) => m.userId === user.id)
      expect(found).toBeUndefined()
    })

    it('should throw when user is not a member', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser()
      const venue = await createTestVenue()

      await expect(
        removeVenueMember(venue.id, user.id, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not a member')
    })

    it('should throw when removing from last venue', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)

      await expect(
        removeVenueMember(venue.id, user.id, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('at least one venue')
    })
  })

  // -------------------------------------------------------------------------
  // Position management
  // -------------------------------------------------------------------------

  describe('createPosition', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a new position', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })

      const position = await createPosition(
        'Head Chef',
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(position).toBeDefined()
      expect(position!.name).toBe('Head Chef')
    })

    it('should throw when position name already exists', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      await createPosition('Bartender', admin.id, '127.0.0.1', 'test-agent')

      await expect(
        createPosition('Bartender', admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('already exists')
    })
  })

  describe('deletePosition', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should delete a position not in use', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const position = await createPosition('Temp Position', admin.id, '127.0.0.1', 'test-agent')

      await deletePosition(position!.id, admin.id, '127.0.0.1', 'test-agent')

      const allPositions = await listPositions()
      const found = allPositions.find((p: { id: string }) => p.id === position!.id)
      expect(found).toBeUndefined()
    })

    it('should throw for non-existent position', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        deletePosition(fakeId, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not found')
    })
  })
})
