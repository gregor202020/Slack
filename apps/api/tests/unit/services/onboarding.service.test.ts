/**
 * Unit tests for onboarding.service.ts.
 *
 * Tests onboarding status checks, profile completion,
 * and lookup of positions/venues for the onboarding flow.
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
  getOnboardingStatus,
  completeOnboarding,
  listPositions,
  listVenuesForOnboarding,
} from '../../../src/services/onboarding.service.js'
import {
  createTestUser,
  createTestVenue,
  cleanupTestData,
} from '../../helpers/db'
import { db, positions } from '@smoker/db'

describe('Onboarding Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // getOnboardingStatus
  // -------------------------------------------------------------------------

  describe('getOnboardingStatus', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return incomplete status for a new user', async () => {
      const user = await createTestUser()

      const status = await getOnboardingStatus(user.id)

      expect(status.completed).toBe(false)
      expect(status.profileCompletedAt).toBeNull()
      expect(status.missingFields.length).toBeGreaterThan(0)
    })

    it('should indicate missing email, address, and positionId', async () => {
      const user = await createTestUser()

      const status = await getOnboardingStatus(user.id)

      expect(status.missingFields).toContain('email')
      expect(status.missingFields).toContain('address')
      expect(status.missingFields).toContain('positionId')
    })

    it('should throw for non-existent user', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getOnboardingStatus(fakeId)).rejects.toThrow()
    })

    it('should report hasVenue as false for user with no venue', async () => {
      const user = await createTestUser()

      const status = await getOnboardingStatus(user.id)

      expect(status.hasVenue).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // completeOnboarding
  // -------------------------------------------------------------------------

  describe('completeOnboarding', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should complete onboarding with valid data', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()

      // Create a position
      const [position] = await db
        .insert(positions)
        .values({ name: 'Server' })
        .returning()

      const result = await completeOnboarding(
        user.id,
        {
          fullName: 'John Doe',
          email: 'john@example.com',
          address: '123 Main St',
          positionId: position!.id,
          timezone: 'America/New_York',
          venueId: venue.id,
        },
        '127.0.0.1',
        'test-agent',
      )

      expect(result).toBeDefined()
      expect(result.profileCompletedAt).not.toBeNull()
      expect(result.fullName).toBe('John Doe')
    })

    it('should throw when onboarding is already completed', async () => {
      const user = await createTestUser()
      const venue = await createTestVenue()

      const [position] = await db
        .insert(positions)
        .values({ name: 'Cook' })
        .returning()

      await completeOnboarding(
        user.id,
        {
          fullName: 'Jane Doe',
          email: 'jane@example.com',
          address: '456 Elm St',
          positionId: position!.id,
          timezone: 'UTC',
          venueId: venue.id,
        },
        '127.0.0.1',
        'test-agent',
      )

      await expect(
        completeOnboarding(
          user.id,
          {
            fullName: 'Jane Again',
            email: 'jane2@example.com',
            address: '789 Oak St',
            positionId: position!.id,
            timezone: 'UTC',
          },
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('already completed')
    })

    it('should throw for invalid position ID', async () => {
      const user = await createTestUser()
      const fakePositionId = '00000000-0000-4000-a000-000000000000'

      await expect(
        completeOnboarding(
          user.id,
          {
            fullName: 'Test',
            email: 'test@test.com',
            address: '123 Test St',
            positionId: fakePositionId,
            timezone: 'UTC',
          },
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })

    it('should throw for non-existent user', async () => {
      const fakeUserId = '00000000-0000-4000-a000-000000000000'

      await expect(
        completeOnboarding(
          fakeUserId,
          {
            fullName: 'Ghost',
            email: 'ghost@test.com',
            address: '000 Ghost Rd',
            positionId: '00000000-0000-4000-a000-000000000001',
            timezone: 'UTC',
          },
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // listPositions
  // -------------------------------------------------------------------------

  describe('listPositions', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return available positions', async () => {
      await db.insert(positions).values({ name: 'Manager' })
      await db.insert(positions).values({ name: 'Bartender' })

      const result = await listPositions()

      expect(result.length).toBeGreaterThanOrEqual(2)
    })

    it('should return empty list when no positions exist', async () => {
      // positions table should be empty after cleanup
      await db.delete(positions)

      const result = await listPositions()

      expect(result).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // listVenuesForOnboarding
  // -------------------------------------------------------------------------

  describe('listVenuesForOnboarding', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return active venues', async () => {
      await createTestVenue({ name: 'Active Venue', status: 'active' })

      const result = await listVenuesForOnboarding()

      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].name).toBeDefined()
    })

    it('should not return archived venues', async () => {
      await createTestVenue({ name: 'Archived Venue', status: 'archived' })

      const result = await listVenuesForOnboarding()

      const found = result.find((v: { name: string }) => v.name === 'Archived Venue')
      expect(found).toBeUndefined()
    })
  })
})
