/**
 * E2E tests for the Venue API.
 *
 * Covers: list, create, get details, update, membership,
 * archive/unarchive, and role enforcement.
 *
 * Routes tested:
 *   GET    /api/venues                           — list venues
 *   POST   /api/venues                           — create venue
 *   GET    /api/venues/:venueId                  — get venue details
 *   PATCH  /api/venues/:venueId                  — update venue
 *   POST   /api/venues/:venueId/archive          — archive venue
 *   POST   /api/venues/:venueId/unarchive        — unarchive venue
 *   GET    /api/venues/:venueId/members           — list venue members
 *   POST   /api/venues/:venueId/members           — add member to venue
 *   DELETE /api/venues/:venueId/members/:userId   — remove member
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
  cleanupTestData,
} from '../helpers/db'

describe('Venue API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  }, 30000)

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/venues — List venues
  // -------------------------------------------------------------------------

  describe('GET /api/venues — List venues', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list venues for an authenticated user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      await createTestVenue({ name: 'Main Venue' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/venues',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/venues',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/venues — Create venue
  // -------------------------------------------------------------------------

  describe('POST /api/venues — Create venue', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to create a venue', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/venues',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'New Venue',
          address: '456 Test Ave',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.name).toBe('New Venue')
    })

    it('should allow super_admin to create a venue', async () => {
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/venues',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Super Venue',
          address: '789 Super St',
        },
      })

      expect(response.statusCode).toBe(201)
    })

    it('should return 403 for basic user', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/venues',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Unauthorized Venue',
          address: '000 Nope Rd',
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 403 for mid user', async () => {
      const mid = await createTestUser({ orgRole: 'mid' })
      const session = await createTestSession(mid.id)
      const token = generateTestToken(mid.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/venues',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Mid Venue',
          address: '111 Mid St',
        },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/venues/:venueId — Get venue details
  // -------------------------------------------------------------------------

  describe('GET /api/venues/:venueId — Get venue details', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return venue details', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Detail Venue' })
      await addUserToVenue(user.id, venue.id, 'basic')

      const response = await app.inject({
        method: 'GET',
        url: `/api/venues/${venue.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(venue.id)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/venues/:venueId — Update venue
  // -------------------------------------------------------------------------

  describe('PATCH /api/venues/:venueId — Update venue', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow venue admin to update the venue', async () => {
      const admin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const venue = await createTestVenue({ name: 'Update Venue' })
      await addUserToVenue(admin.id, venue.id, 'admin')

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/venues/${venue.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Venue Name' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 403 for basic venue member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'No Update Venue' })
      await addUserToVenue(user.id, venue.id, 'basic')

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/venues/${venue.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Hacked Name' },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/venues/:venueId/archive — Archive venue
  // -------------------------------------------------------------------------

  describe('POST /api/venues/:venueId/archive — Archive venue', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow super_admin to archive a venue', async () => {
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const venue = await createTestVenue({ name: 'Archive Venue' })

      const response = await app.inject({
        method: 'POST',
        url: `/api/venues/${venue.id}/archive`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 403 for admin (only super_admin can archive venues)', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const venue = await createTestVenue({ name: 'No Archive' })

      const response = await app.inject({
        method: 'POST',
        url: `/api/venues/${venue.id}/archive`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/venues/:venueId/unarchive — Unarchive venue
  // -------------------------------------------------------------------------

  describe('POST /api/venues/:venueId/unarchive — Unarchive venue', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow super_admin to unarchive a venue', async () => {
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const venue = await createTestVenue({
        name: 'Archived Venue',
        status: 'archived',
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/venues/${venue.id}/unarchive`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  // -------------------------------------------------------------------------
  // Venue membership
  // -------------------------------------------------------------------------

  describe('Venue membership', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list venue members', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const venue = await createTestVenue({ name: 'Members Venue' })
      await addUserToVenue(admin.id, venue.id, 'admin')

      const response = await app.inject({
        method: 'GET',
        url: `/api/venues/${venue.id}/members`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should add a member to a venue', async () => {
      const admin = await createTestUser({ orgRole: 'super_admin' })
      const newMember = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const venue = await createTestVenue({ name: 'Add Member Venue' })
      await addUserToVenue(admin.id, venue.id, 'admin')

      const response = await app.inject({
        method: 'POST',
        url: `/api/venues/${venue.id}/members`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          userId: newMember.id,
          venueRole: 'basic',
        },
      })

      expect(response.statusCode).toBe(201)
    })

    it('should return 403 for basic member trying to add members', async () => {
      const basic = await createTestUser({ orgRole: 'basic' })
      const newMember = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(basic.id)
      const token = generateTestToken(basic.id, session.id)

      const venue = await createTestVenue({ name: 'No Add Venue' })
      await addUserToVenue(basic.id, venue.id, 'basic')

      const response = await app.inject({
        method: 'POST',
        url: `/api/venues/${venue.id}/members`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          userId: newMember.id,
          venueRole: 'basic',
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should remove a member from a venue', async () => {
      const admin = await createTestUser({ orgRole: 'super_admin' })
      const member = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const venue = await createTestVenue({ name: 'Remove Member Venue' })
      const otherVenue = await createTestVenue({ name: 'Other Venue' })
      await addUserToVenue(admin.id, venue.id, 'admin')
      await addUserToVenue(member.id, venue.id, 'basic')
      await addUserToVenue(member.id, otherVenue.id, 'basic')

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/venues/${venue.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })
  })
})
