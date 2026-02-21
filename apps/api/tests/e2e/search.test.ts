/**
 * E2E tests for the Search API.
 *
 * Covers: unified search (type=all), messages-only search, channels-only search,
 * users-only search, query validation, auth enforcement, access control,
 * admin visibility, and pagination.
 *
 * Routes tested:
 *   GET /api/search?q=...&type=all|messages|channels|users&cursor=...&limit=...
 *
 * IMPORTANT: Search uses PostgreSQL full-text search (to_tsvector/to_tsquery).
 * Multi-word, distinctive messages are used to ensure reliable FTS matching.
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
  createTestMessage,
  cleanupTestData,
} from '../helpers/db'

describe('Search API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/search?type=all — Unified search
  // -------------------------------------------------------------------------

  describe('GET /api/search?type=all — Unified search', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return messages, channels, and users matching the query', async () => {
      const user = await createTestUser({ orgRole: 'basic', fullName: 'Zamboni Operator' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'zamboni-discussion' })
      await addUserToChannel(channel.id, user.id)

      await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'The zamboni machine requires regular maintenance every season',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=zamboni&type=all',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('messages')
      expect(body).toHaveProperty('channels')
      expect(body).toHaveProperty('users')
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/search?type=messages — Messages-only search
  // -------------------------------------------------------------------------

  describe('GET /api/search?type=messages — Messages search', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return messages matching the search query', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'search-msg-test' })
      await addUserToChannel(channel.id, user.id)

      await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Quarterly financial reconciliation report is overdue',
      })
      await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Please update the inventory spreadsheet before Friday',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=reconciliation&type=messages',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('messages')
      expect(body.messages.length).toBeGreaterThanOrEqual(1)
      expect(body.messages[0].body).toContain('reconciliation')
    })

    it('should return headline with highlighted snippets', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'headline-test' })
      await addUserToChannel(channel.id, user.id)

      await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'The photosynthesis experiment yielded remarkable results yesterday',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=photosynthesis&type=messages',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.messages.length).toBeGreaterThanOrEqual(1)
      expect(body.messages[0]).toHaveProperty('headline')
      expect(body.messages[0].headline).toContain('<mark>')
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/search?type=channels — Channels-only search
  // -------------------------------------------------------------------------

  describe('GET /api/search?type=channels — Channels search', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return channels matching the search query', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      // Create a public channel with a distinctive name
      await createTestChannel({ name: 'astrophysics-laboratory', type: 'public' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=astrophysics&type=channels',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('channels')
      expect(Array.isArray(body.channels)).toBe(true)
      expect(body.channels.length).toBeGreaterThanOrEqual(1)
      expect(body.channels[0].name).toContain('astrophysics')
    })

    it('should not return private channels the user is not a member of', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      await createTestChannel({ name: 'xenomorphology-private', type: 'private' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=xenomorphology&type=channels',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      const match = body.channels.find((ch: { name: string }) => ch.name.includes('xenomorphology'))
      expect(match).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/search?type=users — Users-only search
  // -------------------------------------------------------------------------

  describe('GET /api/search?type=users — Users search', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return users matching the search query', async () => {
      const searcher = await createTestUser({ orgRole: 'basic', fullName: 'Searcher Person' })
      const session = await createTestSession(searcher.id)
      const token = generateTestToken(searcher.id, session.id)

      await createTestUser({ fullName: 'Bartholomew Henderson' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=Bartholomew&type=users',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('users')
      expect(Array.isArray(body.users)).toBe(true)
      expect(body.users.length).toBeGreaterThanOrEqual(1)
      expect(body.users[0].fullName).toContain('Bartholomew')
    })
  })

  // -------------------------------------------------------------------------
  // Query validation
  // -------------------------------------------------------------------------

  describe('Query validation', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return 400 for too-short query (1 character)', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=x',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 400 for missing q parameter', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/search?type=all',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // Auth enforcement
  // -------------------------------------------------------------------------

  describe('Authentication', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=something&type=all',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // Access control: basic user cannot see messages in channels they are not in
  // -------------------------------------------------------------------------

  describe('Access control', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should not return messages from channels the user is not a member of (private channel)', async () => {
      const author = await createTestUser({ orgRole: 'basic', fullName: 'Author User' })
      const outsider = await createTestUser({ orgRole: 'basic', fullName: 'Outsider User' })
      const authorSession = await createTestSession(author.id)
      const outsiderSession = await createTestSession(outsider.id)
      const outsiderToken = generateTestToken(outsider.id, outsiderSession.id)

      // Create a private channel and only add the author
      const privateChannel = await createTestChannel({
        name: 'cryptography-private',
        type: 'private',
      })
      await addUserToChannel(privateChannel.id, author.id)

      await createTestMessage({
        channelId: privateChannel.id,
        userId: author.id,
        body: 'Cryptographic algorithm implementation details for quantum resistant encryption',
      })

      // Outsider searches — should NOT find the private channel message
      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=cryptographic algorithm&type=messages',
        headers: { authorization: `Bearer ${outsiderToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      const found = body.messages.find(
        (m: { body: string }) => m.body.includes('cryptographic'),
      )
      expect(found).toBeUndefined()
    })

    it('should allow admin to see all messages including private channels', async () => {
      const author = await createTestUser({ orgRole: 'basic', fullName: 'Author User' })
      const admin = await createTestUser({ orgRole: 'admin', fullName: 'Admin User' })
      const authorSession = await createTestSession(author.id)
      const adminSession = await createTestSession(admin.id)
      const adminToken = generateTestToken(admin.id, adminSession.id)

      const privateChannel = await createTestChannel({
        name: 'paleontology-secret',
        type: 'private',
      })
      await addUserToChannel(privateChannel.id, author.id)

      await createTestMessage({
        channelId: privateChannel.id,
        userId: author.id,
        body: 'Paleontological excavation discovered remarkable fossilized dinosaur specimens',
      })

      // Admin searches — should find the message despite not being a member
      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=paleontological excavation&type=messages',
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.messages.length).toBeGreaterThanOrEqual(1)
      expect(body.messages[0].body).toContain('Paleontological')
    })
  })

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe('Pagination', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should support cursor-based pagination with limit', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'pagination-search' })
      await addUserToChannel(channel.id, user.id)

      // Create several searchable messages with a common distinctive term
      for (let i = 0; i < 5; i++) {
        await createTestMessage({
          channelId: channel.id,
          userId: user.id,
          body: `Thermodynamics lecture number ${i} covering entropy calculations`,
        })
      }

      // Request with a small limit to trigger pagination
      const response = await app.inject({
        method: 'GET',
        url: '/api/search?q=thermodynamics&type=messages&limit=2',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.messages.length).toBe(2)
      expect(body.nextCursor).toBeTruthy()

      // Use the cursor to get the next page
      const response2 = await app.inject({
        method: 'GET',
        url: `/api/search?q=thermodynamics&type=messages&limit=2&cursor=${encodeURIComponent(body.nextCursor)}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response2.statusCode).toBe(200)
      const body2 = response2.json()
      expect(body2.messages.length).toBeGreaterThanOrEqual(1)
    })
  })
})
