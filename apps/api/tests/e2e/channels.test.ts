/**
 * E2E tests for the Channel API.
 *
 * Covers: list, create, get details, update, add/remove members,
 * archive/unarchive, auth and role enforcement.
 *
 * Routes tested:
 *   GET    /api/channels              — list channels
 *   POST   /api/channels              — create channel
 *   GET    /api/channels/:id          — get channel details
 *   PATCH  /api/channels/:id          — update channel
 *   POST   /api/channels/:id/members  — add members
 *   DELETE /api/channels/:id/members/:userId — remove member
 *   POST   /api/channels/:id/archive  — archive channel
 *   POST   /api/channels/:id/join     — join public channel
 *   POST   /api/channels/:id/leave    — leave channel
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestChannel,
  addUserToChannel,
  cleanupTestData,
} from '../helpers/db'

describe('Channel API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/channels — List channels
  // -------------------------------------------------------------------------

  describe('GET /api/channels — List channels', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list channels for an authenticated user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      await createTestChannel({ name: 'general' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('channels')
      expect(Array.isArray(body.channels)).toBe(true)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/channels',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/channels — Create channel
  // -------------------------------------------------------------------------

  describe('POST /api/channels — Create channel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a channel for any authenticated user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'new-channel',
          type: 'public',
          scope: 'org',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.name).toBe('new-channel')
      expect(body.type).toBe('public')
      expect(body.scope).toBe('org')
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        payload: {
          name: 'unauthorized-channel',
          type: 'public',
          scope: 'org',
        },
      })

      expect(response.statusCode).toBe(401)
    })

    it('should return 422 for invalid payload (missing name)', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          type: 'public',
          scope: 'org',
        },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/channels/:channelId — Get channel details
  // -------------------------------------------------------------------------

  describe('GET /api/channels/:channelId — Get channel details', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return channel details for a member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'details-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'GET',
        url: `/api/channels/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(channel.id)
      expect(body.name).toBe('details-test')
    })

    it('should return 403 for a non-member (basic role)', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'private-channel' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/channels/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should allow admin to access any channel', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const channel = await createTestChannel({ name: 'admin-access-test' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/channels/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      // Admin bypasses channel membership checks
      expect(response.statusCode).toBe(200)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/channels/:channelId — Update channel
  // -------------------------------------------------------------------------

  describe('PATCH /api/channels/:channelId — Update channel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update a channel topic for a member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({
        name: 'update-test',
        ownerUserId: user.id,
      })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/channels/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { topic: 'New topic' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/channels/:channelId/members — Add members
  // -------------------------------------------------------------------------

  describe('POST /api/channels/:channelId/members — Add members', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should add members to a channel', async () => {
      const owner = await createTestUser({ orgRole: 'basic' })
      const newMember = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(owner.id)
      const token = generateTestToken(owner.id, session.id)

      const channel = await createTestChannel({
        name: 'member-test',
        ownerUserId: owner.id,
      })
      await addUserToChannel(channel.id, owner.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/channels/${channel.id}/members`,
        headers: { authorization: `Bearer ${token}` },
        payload: { userIds: [newMember.id] },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 when non-member tries to add members', async () => {
      const outsider = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(outsider.id)
      const token = generateTestToken(outsider.id, session.id)

      const channel = await createTestChannel({ name: 'closed-channel' })

      const response = await app.inject({
        method: 'POST',
        url: `/api/channels/${channel.id}/members`,
        headers: { authorization: `Bearer ${token}` },
        payload: { userIds: [outsider.id] },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /api/channels/:channelId/members/:userId — Remove member
  // -------------------------------------------------------------------------

  describe('DELETE /api/channels/:id/members/:userId — Remove member', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should remove a member from a channel', async () => {
      const owner = await createTestUser({ orgRole: 'admin' })
      const member = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(owner.id)
      const token = generateTestToken(owner.id, session.id)

      const channel = await createTestChannel({
        name: 'remove-member-test',
        ownerUserId: owner.id,
      })
      await addUserToChannel(channel.id, owner.id)
      await addUserToChannel(channel.id, member.id)

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/channels/${channel.id}/members/${member.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/channels/:channelId/archive — Archive channel
  // -------------------------------------------------------------------------

  describe('POST /api/channels/:channelId/archive — Archive channel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow admin to archive a channel', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const channel = await createTestChannel({ name: 'archive-test' })

      const response = await app.inject({
        method: 'POST',
        url: `/api/channels/${channel.id}/archive`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 for basic user trying to archive', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'no-archive' })

      const response = await app.inject({
        method: 'POST',
        url: `/api/channels/${channel.id}/archive`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/channels/:channelId/join — Join public channel
  // -------------------------------------------------------------------------

  describe('POST /api/channels/:channelId/join — Join channel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow a user to join a public channel', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({
        name: 'public-join',
        type: 'public',
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/channels/${channel.id}/join`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/channels/:channelId/leave — Leave channel
  // -------------------------------------------------------------------------

  describe('POST /api/channels/:channelId/leave — Leave channel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow a member to leave a channel', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'leave-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/channels/${channel.id}/leave`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })
  })
})
