/**
 * E2E tests for the Shift API.
 *
 * Covers: CRUD operations, role enforcement, and the full
 * shift-swap workflow (request, accept, decline).
 *
 * Routes tested:
 *   POST   /api/shifts              — create shift (admin only)
 *   GET    /api/shifts/venue/:id    — list shifts for a venue
 *   GET    /api/shifts/:shiftId     — get shift by ID
 *   PATCH  /api/shifts/:shiftId     — update shift (admin only)
 *   DELETE /api/shifts/:shiftId     — delete shift (admin only)
 *   POST   /api/shifts/:shiftId/swap-request — request swap
 *   POST   /api/shifts/swaps/:id/accept      — accept swap
 *   POST   /api/shifts/swaps/:id/decline     — decline swap
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestVenue,
  addUserToVenue,
  createTestShift,
  cleanupTestData,
} from '../helpers/db'

describe('Shift API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // POST /api/shifts — Create shift
  // -------------------------------------------------------------------------

  describe('POST /api/shifts — Create shift', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to create a shift', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const worker = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const venue = await createTestVenue()
      await addUserToVenue(worker.id, venue.id)

      const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const endTime = new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString()

      const response = await app.inject({
        method: 'POST',
        url: '/api/shifts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          userId: worker.id,
          startTime,
          endTime,
          roleLabel: 'Bartender',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.venueId).toBe(venue.id)
      expect(body.userId).toBe(worker.id)
      expect(body.roleLabel).toBe('Bartender')
      expect(body.version).toBe(1)
    })

    it('should return 403 for basic user trying to create a shift', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const worker = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const venue = await createTestVenue()
      await addUserToVenue(worker.id, venue.id)

      const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const endTime = new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString()

      const response = await app.inject({
        method: 'POST',
        url: '/api/shifts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          userId: worker.id,
          startTime,
          endTime,
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/shifts',
        payload: {
          venueId: '00000000-0000-4000-a000-000000000000',
          userId: '00000000-0000-4000-a000-000000000001',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/shifts/venue/:venueId — List shifts for a venue
  // -------------------------------------------------------------------------

  describe('GET /api/shifts/venue/:venueId — List venue shifts', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list shifts for a venue', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)

      await createTestShift({ venueId: venue.id, userId: user.id })

      const response = await app.inject({
        method: 'GET',
        url: `/api/shifts/venue/${venue.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThanOrEqual(1)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/shifts/:shiftId — Get shift by ID
  // -------------------------------------------------------------------------

  describe('GET /api/shifts/:shiftId — Get shift details', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return shift details', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue()
      await addUserToVenue(user.id, venue.id)

      const shift = await createTestShift({
        venueId: venue.id,
        userId: user.id,
        roleLabel: 'Server',
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/shifts/${shift.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(shift.id)
      expect(body.roleLabel).toBe('Server')
    })

    it('should return 404 for non-existent shift', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/shifts/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
      const body = response.json()
      expect(body.error.code).toBe('SHIFT_NOT_FOUND')
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/shifts/:shiftId — Update shift
  // -------------------------------------------------------------------------

  describe('PATCH /api/shifts/:shiftId — Update shift', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to update a shift', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const worker = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const venue = await createTestVenue()
      await addUserToVenue(worker.id, venue.id)

      const shift = await createTestShift({
        venueId: venue.id,
        userId: worker.id,
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/shifts/${shift.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          notes: 'Updated notes',
          expectedVersion: 1,
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.notes).toBe('Updated notes')
      expect(body.version).toBe(2)
    })

    it('should return 403 for basic user trying to update', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const venue = await createTestVenue()
      await addUserToVenue(basic.id, venue.id)

      const shift = await createTestShift({
        venueId: venue.id,
        userId: basic.id,
      })

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/shifts/${shift.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          notes: 'Should fail',
          expectedVersion: 1,
        },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /api/shifts/:shiftId — Delete shift
  // -------------------------------------------------------------------------

  describe('DELETE /api/shifts/:shiftId — Delete shift', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to delete a shift', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const worker = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const venue = await createTestVenue()
      await addUserToVenue(worker.id, venue.id)

      const shift = await createTestShift({
        venueId: venue.id,
        userId: worker.id,
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/shifts/${shift.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 for basic user trying to delete', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const venue = await createTestVenue()
      await addUserToVenue(basic.id, venue.id)

      const shift = await createTestShift({
        venueId: venue.id,
        userId: basic.id,
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/shifts/${shift.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 404 for non-existent shift', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/shifts/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // Shift swap workflow
  // -------------------------------------------------------------------------

  describe('Shift swap workflow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow a user to request a swap', async () => {
      const userA = await createTestUser({ orgRole: 'basic', fullName: 'User A' })
      const userB = await createTestUser({ orgRole: 'basic', fullName: 'User B' })
      const sessionA = await createTestSession(userA.id)
      const tokenA = generateTestToken(userA.id, sessionA.id)

      const venue = await createTestVenue()
      await addUserToVenue(userA.id, venue.id)
      await addUserToVenue(userB.id, venue.id)

      const shiftA = await createTestShift({
        venueId: venue.id,
        userId: userA.id,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      const shiftB = await createTestShift({
        venueId: venue.id,
        userId: userB.id,
        startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/shifts/${shiftA.id}/swap-request`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          shiftId: shiftA.id,
          targetUserId: userB.id,
          targetShiftId: shiftB.id,
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.status).toBe('pending')
      expect(body.requesterUserId).toBe(userA.id)
      expect(body.targetUserId).toBe(userB.id)
    })

    it('should allow the target user to accept a swap and verify shifts are swapped', async () => {
      const userA = await createTestUser({ orgRole: 'basic', fullName: 'User A' })
      const userB = await createTestUser({ orgRole: 'basic', fullName: 'User B' })
      const sessionA = await createTestSession(userA.id)
      const sessionB = await createTestSession(userB.id)
      const tokenA = generateTestToken(userA.id, sessionA.id)
      const tokenB = generateTestToken(userB.id, sessionB.id)

      const venue = await createTestVenue()
      await addUserToVenue(userA.id, venue.id)
      await addUserToVenue(userB.id, venue.id)

      const shiftA = await createTestShift({
        venueId: venue.id,
        userId: userA.id,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      const shiftB = await createTestShift({
        venueId: venue.id,
        userId: userB.id,
        startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      })

      // Step 1: Request swap
      const swapResponse = await app.inject({
        method: 'POST',
        url: `/api/shifts/${shiftA.id}/swap-request`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          shiftId: shiftA.id,
          targetUserId: userB.id,
          targetShiftId: shiftB.id,
        },
      })

      expect(swapResponse.statusCode).toBe(201)
      const swap = swapResponse.json()

      // Step 2: Accept swap
      const acceptResponse = await app.inject({
        method: 'POST',
        url: `/api/shifts/swaps/${swap.id}/accept`,
        headers: { authorization: `Bearer ${tokenB}` },
      })

      expect(acceptResponse.statusCode).toBe(200)
      const acceptBody = acceptResponse.json()
      expect(acceptBody.success).toBe(true)

      // Step 3: Verify shifts were swapped
      const shiftAResponse = await app.inject({
        method: 'GET',
        url: `/api/shifts/${shiftA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      })

      const shiftBResponse = await app.inject({
        method: 'GET',
        url: `/api/shifts/${shiftB.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      })

      const updatedShiftA = shiftAResponse.json()
      const updatedShiftB = shiftBResponse.json()

      // After swap: shiftA should now belong to userB, shiftB to userA
      expect(updatedShiftA.userId).toBe(userB.id)
      expect(updatedShiftB.userId).toBe(userA.id)
    })

    it('should allow the target user to decline a swap', async () => {
      const userA = await createTestUser({ orgRole: 'basic', fullName: 'User A' })
      const userB = await createTestUser({ orgRole: 'basic', fullName: 'User B' })
      const sessionA = await createTestSession(userA.id)
      const sessionB = await createTestSession(userB.id)
      const tokenA = generateTestToken(userA.id, sessionA.id)
      const tokenB = generateTestToken(userB.id, sessionB.id)

      const venue = await createTestVenue()
      await addUserToVenue(userA.id, venue.id)
      await addUserToVenue(userB.id, venue.id)

      const shiftA = await createTestShift({
        venueId: venue.id,
        userId: userA.id,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      const shiftB = await createTestShift({
        venueId: venue.id,
        userId: userB.id,
        startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      })

      // Request swap
      const swapResponse = await app.inject({
        method: 'POST',
        url: `/api/shifts/${shiftA.id}/swap-request`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          shiftId: shiftA.id,
          targetUserId: userB.id,
          targetShiftId: shiftB.id,
        },
      })

      const swap = swapResponse.json()

      // Decline swap
      const declineResponse = await app.inject({
        method: 'POST',
        url: `/api/shifts/swaps/${swap.id}/decline`,
        headers: { authorization: `Bearer ${tokenB}` },
      })

      expect(declineResponse.statusCode).toBe(200)
      const declineBody = declineResponse.json()
      expect(declineBody.success).toBe(true)

      // Verify shifts remain unchanged
      const shiftAResponse = await app.inject({
        method: 'GET',
        url: `/api/shifts/${shiftA.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
      })

      const updatedShiftA = shiftAResponse.json()
      expect(updatedShiftA.userId).toBe(userA.id)
      expect(updatedShiftA.lockedBySwapId).toBeNull()
    })

    it('should return 403 when non-target user tries to accept a swap', async () => {
      const userA = await createTestUser({ orgRole: 'basic', fullName: 'User A' })
      const userB = await createTestUser({ orgRole: 'basic', fullName: 'User B' })
      const sessionA = await createTestSession(userA.id)
      const sessionB = await createTestSession(userB.id)
      const tokenA = generateTestToken(userA.id, sessionA.id)
      const tokenB = generateTestToken(userB.id, sessionB.id)

      const venue = await createTestVenue()
      await addUserToVenue(userA.id, venue.id)
      await addUserToVenue(userB.id, venue.id)

      const shiftA = await createTestShift({
        venueId: venue.id,
        userId: userA.id,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      const shiftB = await createTestShift({
        venueId: venue.id,
        userId: userB.id,
        startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
      })

      // Request swap
      const swapResponse = await app.inject({
        method: 'POST',
        url: `/api/shifts/${shiftA.id}/swap-request`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          shiftId: shiftA.id,
          targetUserId: userB.id,
          targetShiftId: shiftB.id,
        },
      })

      const swap = swapResponse.json()

      // Requester (not target) tries to accept
      const response = await app.inject({
        method: 'POST',
        url: `/api/shifts/swaps/${swap.id}/accept`,
        headers: { authorization: `Bearer ${tokenA}` },
      })

      expect(response.statusCode).toBe(403)
      const body = response.json()
      expect(body.error.code).toBe('NOT_SWAP_TARGET')
    })
  })
})
