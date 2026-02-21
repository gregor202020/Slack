/**
 * Unit tests for shift.service.ts.
 *
 * Tests shift CRUD, roster views, optimistic locking,
 * and the shift-swap workflow.
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
  getMyShifts,
  getVenueRoster,
  createShift,
  getShift,
  updateShift,
  deleteShift,
  requestSwap,
  declineSwap,
  listMySwaps,
} from '../../../src/services/shift.service.js'
import {
  createTestUser,
  createTestVenue,
  addUserToVenue,
  createTestShift,
  cleanupTestData,
} from '../../helpers/db'

describe('Shift Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // createShift
  // -------------------------------------------------------------------------

  describe('createShift', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a shift for a venue member', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)

      const startTime = new Date(Date.now() + 86400000).toISOString()
      const endTime = new Date(Date.now() + 86400000 + 28800000).toISOString()

      const shift = await createShift(
        {
          venueId: venue.id,
          userId: user.id,
          startTime,
          endTime,
          roleLabel: 'Bartender',
        },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(shift).toBeDefined()
      expect(shift.venueId).toBe(venue.id)
      expect(shift.userId).toBe(user.id)
      expect(shift.roleLabel).toBe('Bartender')
      expect(shift.version).toBe(1)
    })

    it('should throw when venue does not exist', async () => {
      const user = await createTestUser()
      const fakeVenueId = '00000000-0000-4000-a000-000000000000'

      await expect(
        createShift(
          {
            venueId: fakeVenueId,
            userId: user.id,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
          },
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('Venue not found')
    })

    it('should throw when user is not a venue member', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()

      await expect(
        createShift(
          {
            venueId: venue.id,
            userId: user.id,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
          },
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('not a member')
    })

    it('should throw when shifts overlap at the same venue', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)

      const start = new Date(Date.now() + 86400000)
      const end = new Date(start.getTime() + 28800000)

      await createShift(
        {
          venueId: venue.id,
          userId: user.id,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        },
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      // Overlapping shift
      const overlapStart = new Date(start.getTime() + 3600000) // 1 hour after
      const overlapEnd = new Date(end.getTime() + 3600000)

      await expect(
        createShift(
          {
            venueId: venue.id,
            userId: user.id,
            startTime: overlapStart.toISOString(),
            endTime: overlapEnd.toISOString(),
          },
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('already has a shift')
    })
  })

  // -------------------------------------------------------------------------
  // getShift
  // -------------------------------------------------------------------------

  describe('getShift', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a shift by ID', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)
      const shift = await createTestShift({ venueId: venue.id, userId: user.id })

      const found = await getShift(shift.id)

      expect(found.id).toBe(shift.id)
      expect(found.userName).toBeDefined()
      expect(found.venueName).toBeDefined()
    })

    it('should throw for non-existent shift', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getShift(fakeId)).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // getMyShifts
  // -------------------------------------------------------------------------

  describe('getMyShifts', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return shifts for the user', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)
      await createTestShift({ venueId: venue.id, userId: user.id })

      const result = await getMyShifts(user.id)

      expect(result.shifts.length).toBe(1)
    })

    it('should return empty list for user with no shifts', async () => {
      const user = await createTestUser()

      const result = await getMyShifts(user.id)

      expect(result.shifts).toEqual([])
    })

    it('should filter by date range', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)

      const futureStart = new Date(Date.now() + 7 * 86400000)
      const futureEnd = new Date(futureStart.getTime() + 28800000)
      await createTestShift({
        venueId: venue.id,
        userId: user.id,
        startTime: futureStart,
        endTime: futureEnd,
      })

      const result = await getMyShifts(user.id, {
        startDate: new Date(Date.now() + 6 * 86400000).toISOString(),
        endDate: new Date(Date.now() + 8 * 86400000).toISOString(),
      })

      expect(result.shifts.length).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // getVenueRoster
  // -------------------------------------------------------------------------

  describe('getVenueRoster', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return all shifts for a venue', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user1.id, venue.id)
      await addUserToVenue(user2.id, venue.id)

      const start1 = new Date(Date.now() + 86400000)
      const end1 = new Date(start1.getTime() + 28800000)
      const start2 = new Date(Date.now() + 2 * 86400000)
      const end2 = new Date(start2.getTime() + 28800000)

      await createTestShift({ venueId: venue.id, userId: user1.id, startTime: start1, endTime: end1 })
      await createTestShift({ venueId: venue.id, userId: user2.id, startTime: start2, endTime: end2 })

      const roster = await getVenueRoster(venue.id)

      expect(roster.length).toBe(2)
    })

    it('should throw when date range exceeds 31 days', async () => {
      const venue = await createTestVenue()

      const startDate = new Date().toISOString()
      const endDate = new Date(Date.now() + 40 * 86400000).toISOString()

      await expect(
        getVenueRoster(venue.id, { startDate, endDate }),
      ).rejects.toThrow('31 days')
    })
  })

  // -------------------------------------------------------------------------
  // updateShift
  // -------------------------------------------------------------------------

  describe('updateShift', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update a shift with correct version', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)
      const shift = await createTestShift({ venueId: venue.id, userId: user.id })

      const updated = await updateShift(
        shift.id,
        { notes: 'Updated notes' },
        1, // version
        user.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(updated.notes).toBe('Updated notes')
    })

    it('should throw on version mismatch (optimistic locking)', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)
      const shift = await createTestShift({ venueId: venue.id, userId: user.id })

      await expect(
        updateShift(
          shift.id,
          { notes: 'Stale' },
          999, // wrong version
          user.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('modified by another user')
    })
  })

  // -------------------------------------------------------------------------
  // deleteShift
  // -------------------------------------------------------------------------

  describe('deleteShift', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should delete a shift', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)
      const shift = await createTestShift({ venueId: venue.id, userId: user.id })

      await deleteShift(shift.id, user.id, '127.0.0.1', 'test-agent')

      await expect(getShift(shift.id)).rejects.toThrow('not found')
    })

    it('should throw for non-existent shift', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        deleteShift(fakeId, user.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // requestSwap
  // -------------------------------------------------------------------------

  describe('requestSwap', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a swap request between two shifts', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user1.id, venue.id)
      await addUserToVenue(user2.id, venue.id)

      const start1 = new Date(Date.now() + 86400000)
      const end1 = new Date(start1.getTime() + 28800000)
      const start2 = new Date(Date.now() + 2 * 86400000)
      const end2 = new Date(start2.getTime() + 28800000)

      const shift1 = await createTestShift({ venueId: venue.id, userId: user1.id, startTime: start1, endTime: end1 })
      const shift2 = await createTestShift({ venueId: venue.id, userId: user2.id, startTime: start2, endTime: end2 })

      const swap = await requestSwap(
        { shiftId: shift1.id, targetUserId: user2.id, targetShiftId: shift2.id },
        user1.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(swap).toBeDefined()
      expect(swap.status).toBe('pending')
      expect(swap.requesterUserId).toBe(user1.id)
    })

    it('should throw when requester does not own the source shift', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const user3 = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user1.id, venue.id)
      await addUserToVenue(user2.id, venue.id)
      await addUserToVenue(user3.id, venue.id)

      const shift1 = await createTestShift({ venueId: venue.id, userId: user1.id })
      const shift2 = await createTestShift({ venueId: venue.id, userId: user2.id })

      await expect(
        requestSwap(
          { shiftId: shift1.id, targetUserId: user2.id, targetShiftId: shift2.id },
          user3.id, // not the owner
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('do not own')
    })
  })

  // -------------------------------------------------------------------------
  // declineSwap
  // -------------------------------------------------------------------------

  describe('declineSwap', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should decline a pending swap', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user1.id, venue.id)
      await addUserToVenue(user2.id, venue.id)

      const start1 = new Date(Date.now() + 86400000)
      const end1 = new Date(start1.getTime() + 28800000)
      const start2 = new Date(Date.now() + 2 * 86400000)
      const end2 = new Date(start2.getTime() + 28800000)

      const shift1 = await createTestShift({ venueId: venue.id, userId: user1.id, startTime: start1, endTime: end1 })
      const shift2 = await createTestShift({ venueId: venue.id, userId: user2.id, startTime: start2, endTime: end2 })

      const swap = await requestSwap(
        { shiftId: shift1.id, targetUserId: user2.id, targetShiftId: shift2.id },
        user1.id,
        '127.0.0.1',
        'test-agent',
      )

      await declineSwap(swap.id, user2.id, '127.0.0.1', 'test-agent')

      // Verify by listing swaps
      const swaps = await listMySwaps(user2.id)
      const found = swaps.swaps.find((s: { id: string }) => s.id === swap.id)
      expect(found?.status).toBe('declined')
    })

    it('should throw when non-target tries to decline', async () => {
      const user1 = await createTestUser()
      const user2 = await createTestUser()
      const venue = await createTestVenue()
      await addUserToVenue(user1.id, venue.id)
      await addUserToVenue(user2.id, venue.id)

      const shift1 = await createTestShift({ venueId: venue.id, userId: user1.id })
      const shift2 = await createTestShift({ venueId: venue.id, userId: user2.id })

      const swap = await requestSwap(
        { shiftId: shift1.id, targetUserId: user2.id, targetShiftId: shift2.id },
        user1.id,
        '127.0.0.1',
        'test-agent',
      )

      await expect(
        declineSwap(swap.id, user1.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('target user')
    })
  })

  // -------------------------------------------------------------------------
  // listMySwaps
  // -------------------------------------------------------------------------

  describe('listMySwaps', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return empty list when user has no swaps', async () => {
      const user = await createTestUser()

      const result = await listMySwaps(user.id)

      expect(result.swaps).toEqual([])
    })
  })
})
