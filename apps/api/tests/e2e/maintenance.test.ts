/**
 * E2E tests for the Maintenance API.
 *
 * Covers: list requests, create request, get details, update request,
 * change status, comments CRUD, venue-specific listing, and auth enforcement.
 *
 * Routes tested:
 *   GET    /api/maintenance                                    — list maintenance requests
 *   POST   /api/maintenance                                    — create maintenance request
 *   GET    /api/maintenance/:requestId                         — get request details
 *   PATCH  /api/maintenance/:requestId                         — update request
 *   PATCH  /api/maintenance/:requestId/status                  — change status
 *   POST   /api/maintenance/:requestId/comments                — add comment
 *   GET    /api/maintenance/:requestId/comments                — list comments
 *   DELETE /api/maintenance/:requestId/comments/:commentId     — delete comment
 *   GET    /api/maintenance/venue/:venueId                     — list venue requests
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

describe('Maintenance API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/maintenance — List maintenance requests
  // -------------------------------------------------------------------------

  describe('GET /api/maintenance — List maintenance requests', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list maintenance requests for an authenticated user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(Array.isArray(body.data)).toBe(true)
    })

    it('should support filtering by status', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/maintenance?status=open',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
    })

    it('should support filtering by priority', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/maintenance?priority=high',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/maintenance',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/maintenance — Create maintenance request
  // -------------------------------------------------------------------------

  describe('POST /api/maintenance — Create maintenance request', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a maintenance request', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Maintenance Venue' })
      await addUserToVenue(user.id, venue.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          title: 'Broken AC unit',
          description: 'The air conditioning unit in Room 101 is not working properly.',
          priority: 'high',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.title).toBe('Broken AC unit')
      expect(body.priority).toBe('high')
    })

    it('should return 422 for missing required fields', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Missing fields' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        payload: {
          venueId: '00000000-0000-4000-a000-000000000000',
          title: 'Unauthorized',
          description: 'Test',
          priority: 'low',
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/maintenance/:requestId — Get request details
  // -------------------------------------------------------------------------

  describe('GET /api/maintenance/:requestId — Get request details', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return maintenance request details', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Details Venue' })
      await addUserToVenue(user.id, venue.id)

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          title: 'Leaky faucet',
          description: 'Kitchen faucet is leaking.',
          priority: 'medium',
        },
      })
      const request = createResponse.json()

      const response = await app.inject({
        method: 'GET',
        url: `/api/maintenance/${request.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(request.id)
      expect(body.title).toBe('Leaky faucet')
    })

    it('should return 404 for non-existent request', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/maintenance/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('should return 401 without authentication', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/maintenance/${fakeId}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/maintenance/:requestId — Update request
  // -------------------------------------------------------------------------

  describe('PATCH /api/maintenance/:requestId — Update request', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update a maintenance request', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Update Venue' })
      await addUserToVenue(user.id, venue.id)

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          title: 'Original title',
          description: 'Original description',
          priority: 'low',
        },
      })
      const request = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/maintenance/${request.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Updated title',
          priority: 'urgent',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.title).toBe('Updated title')
      expect(body.priority).toBe('urgent')
    })

    it('should return 401 without authentication', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/maintenance/${fakeId}`,
        payload: { title: 'Unauthorized update' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/maintenance/:requestId/status — Change status
  // -------------------------------------------------------------------------

  describe('PATCH /api/maintenance/:requestId/status — Change status', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should change status of a maintenance request', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Status Venue' })
      await addUserToVenue(user.id, venue.id)

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          title: 'Status test',
          description: 'Change status test',
          priority: 'medium',
        },
      })
      const request = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/maintenance/${request.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'in_progress' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should change status to done via in_progress', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Done Venue' })
      await addUserToVenue(user.id, venue.id)

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          title: 'Complete test',
          description: 'Mark as done',
          priority: 'low',
        },
      })
      const request = createResponse.json()

      // First transition: open -> in_progress
      await app.inject({
        method: 'PATCH',
        url: `/api/maintenance/${request.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'in_progress' },
      })

      // Then transition: in_progress -> done
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/maintenance/${request.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'done' },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 422 for invalid status', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/maintenance/${fakeId}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'invalid_status' },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // Comments on maintenance requests
  // -------------------------------------------------------------------------

  describe('Maintenance Comments', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should add a comment to a maintenance request', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Comment Venue' })
      await addUserToVenue(user.id, venue.id)

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          title: 'Comment test',
          description: 'Test for comments',
          priority: 'low',
        },
      })
      const request = createResponse.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/maintenance/${request.id}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'This is a test comment' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.body).toBe('This is a test comment')
    })

    it('should list comments on a maintenance request', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'List Comments Venue' })
      await addUserToVenue(user.id, venue.id)

      // Create a request
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          title: 'List comments test',
          description: 'For listing comments',
          priority: 'medium',
        },
      })
      const request = createResponse.json()

      // Add a comment
      await app.inject({
        method: 'POST',
        url: `/api/maintenance/${request.id}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'First comment' },
      })

      // List comments
      const response = await app.inject({
        method: 'GET',
        url: `/api/maintenance/${request.id}/comments`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(Array.isArray(body.data)).toBe(true)
      expect(body.data.length).toBeGreaterThanOrEqual(1)
    })

    it('should delete a comment by its author', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Delete Comment Venue' })
      await addUserToVenue(user.id, venue.id)

      // Create a request
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          title: 'Delete comment test',
          description: 'For deleting comments',
          priority: 'low',
        },
      })
      const request = createResponse.json()

      // Add a comment
      const commentResponse = await app.inject({
        method: 'POST',
        url: `/api/maintenance/${request.id}/comments`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Comment to delete' },
      })
      const comment = commentResponse.json()

      // Delete the comment
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/maintenance/${request.id}/comments/${comment.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 when non-author non-admin deletes a comment', async () => {
      const author = await createTestUser({ orgRole: 'basic' })
      const otherUser = await createTestUser({ orgRole: 'basic' })
      const authorSession = await createTestSession(author.id)
      const otherSession = await createTestSession(otherUser.id)
      const authorToken = generateTestToken(author.id, authorSession.id)
      const otherToken = generateTestToken(otherUser.id, otherSession.id)

      const venue = await createTestVenue({ name: 'Forbidden Delete Venue' })
      await addUserToVenue(author.id, venue.id)

      // Create a request
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${authorToken}` },
        payload: {
          venueId: venue.id,
          title: 'Forbidden delete test',
          description: 'Other user cannot delete',
          priority: 'low',
        },
      })
      const request = createResponse.json()

      // Author adds a comment
      const commentResponse = await app.inject({
        method: 'POST',
        url: `/api/maintenance/${request.id}/comments`,
        headers: { authorization: `Bearer ${authorToken}` },
        payload: { body: 'Author comment' },
      })
      const comment = commentResponse.json()

      // Other user tries to delete
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/maintenance/${request.id}/comments/${comment.id}`,
        headers: { authorization: `Bearer ${otherToken}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/maintenance/venue/:venueId — List venue requests
  // -------------------------------------------------------------------------

  describe('GET /api/maintenance/venue/:venueId — List venue requests', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list maintenance requests for a specific venue', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Venue Listing Test' })
      await addUserToVenue(user.id, venue.id)

      // Create a request for this venue
      await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          venueId: venue.id,
          title: 'Venue request',
          description: 'Request for specific venue',
          priority: 'low',
        },
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/maintenance/venue/${venue.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(Array.isArray(body.data)).toBe(true)
    })

    it('should support filtering by status on venue endpoint', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const venue = await createTestVenue({ name: 'Venue Filter Test' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/maintenance/venue/${venue.id}?status=open`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 401 without authentication', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/maintenance/venue/${fakeId}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
