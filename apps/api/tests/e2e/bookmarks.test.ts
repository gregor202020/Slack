/**
 * E2E tests for the Bookmarks API.
 *
 * Covers: list bookmarks, add bookmark, update bookmark note,
 * remove bookmark, auth enforcement, and pagination.
 *
 * Routes tested:
 *   GET    /api/bookmarks              — list current user's bookmarks
 *   POST   /api/bookmarks              — add a bookmark
 *   PATCH  /api/bookmarks/:bookmarkId  — update bookmark note
 *   DELETE /api/bookmarks/:bookmarkId  — remove a bookmark
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestChannel,
  createTestMessage,
  cleanupTestData,
} from '../helpers/db'

describe('Bookmarks API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/bookmarks — List bookmarks
  // -------------------------------------------------------------------------

  describe('GET /api/bookmarks — List bookmarks', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list bookmarks for an authenticated user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(Array.isArray(body.data)).toBe(true)
    })

    it('should return bookmarks after adding one', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bookmark-list-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Bookmark me',
      })

      // Add a bookmark
      await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id, note: 'Important' },
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data.length).toBeGreaterThanOrEqual(1)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks',
      })

      expect(response.statusCode).toBe(401)
    })

    it('should support pagination with limit parameter', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks?limit=5',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('data')
      expect(body).toHaveProperty('nextCursor')
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/bookmarks — Add a bookmark
  // -------------------------------------------------------------------------

  describe('POST /api/bookmarks — Add a bookmark', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should add a bookmark to a message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bookmark-add-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Bookmark this message',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.messageId).toBe(message.id)
      expect(body.id).toBeTruthy()
    })

    it('should add a bookmark with an optional note', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bookmark-note-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Noted message',
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id, note: 'Follow up on this' },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.note).toBe('Follow up on this')
    })

    it('should return 422 for missing messageId', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { note: 'No message ID' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 401 without authentication', async () => {
      const fakeMessageId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        payload: { messageId: fakeMessageId },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/bookmarks/:bookmarkId — Update bookmark note
  // -------------------------------------------------------------------------

  describe('PATCH /api/bookmarks/:bookmarkId — Update bookmark note', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update the note on a bookmark', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bookmark-update-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Update note test',
      })

      // Create bookmark
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id, note: 'Original note' },
      })
      const bookmark = createResponse.json()

      // Update note
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/bookmarks/${bookmark.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { note: 'Updated note' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.note).toBe('Updated note')
    })

    it('should allow clearing note by setting to null', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bookmark-clear-note' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Clear note test',
      })

      // Create bookmark with note
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id, note: 'To be cleared' },
      })
      const bookmark = createResponse.json()

      // Clear note
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/bookmarks/${bookmark.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { note: null },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 401 without authentication', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/bookmarks/${fakeId}`,
        payload: { note: 'Unauthorized' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /api/bookmarks/:bookmarkId — Remove a bookmark
  // -------------------------------------------------------------------------

  describe('DELETE /api/bookmarks/:bookmarkId — Remove a bookmark', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should remove a bookmark', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bookmark-delete-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Delete bookmark test',
      })

      // Create bookmark
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id },
      })
      const bookmark = createResponse.json()

      // Delete it
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/bookmarks/${bookmark.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 401 without authentication', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/bookmarks/${fakeId}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
