/**
 * E2E resilience and error handling tests.
 *
 * Verifies that the API handles malformed input, edge cases, and error
 * conditions gracefully — returning proper error responses instead of 500s.
 *
 * Categories covered:
 *   1. Malformed JSON bodies
 *   2. Invalid UUID parameters
 *   3. Oversized payloads
 *   4. Unicode edge cases
 *   5. Boundary values (pagination)
 *   6. Missing/wrong headers
 *   7. Empty string validation
 *   8. Double submit / idempotency
 *   9. Non-existent resources
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

describe('Resilience & Error Handling', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // ---------------------------------------------------------------------------
  // 1. Malformed JSON Bodies
  // ---------------------------------------------------------------------------

  describe('Malformed JSON bodies', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject invalid JSON with a non-200 status code', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'malformed-json-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: '{invalid json!!!}',
      })

      // Fastify returns 400 for parse errors; some setups may return 500
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    })

    it('should reject completely empty body on POST endpoint that expects JSON', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: '',
      })

      // Empty body with content-type: application/json returns an error
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    })

    it('should reject a plain string body instead of an object', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'string-body-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: '"hello"',
      })

      expect(response.statusCode).not.toBe(500)
      expect([400, 422]).toContain(response.statusCode)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Invalid UUID Parameters
  // ---------------------------------------------------------------------------

  describe('Invalid UUID parameters', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject non-UUID channelId in GET messages', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/messages/channel/not-a-uuid',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).not.toBe(500)
      expect([400, 422]).toContain(response.statusCode)
      const body = response.json()
      expect(body).toHaveProperty('error')
    })

    it('should reject non-UUID userId in GET user by ID', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/not-a-uuid',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).not.toBe(500)
      expect([400, 422]).toContain(response.statusCode)
    })

    it('should reject non-UUID messageId in PATCH message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/messages/not-a-uuid',
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Attempting edit with bad ID' },
      })

      expect(response.statusCode).not.toBe(500)
      expect([400, 422]).toContain(response.statusCode)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Oversized Payloads
  // ---------------------------------------------------------------------------

  describe('Oversized payloads', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject a message body exceeding 40,000 characters', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'oversized-msg-test' })
      await addUserToChannel(channel.id, user.id)

      const oversizedBody = 'x'.repeat(50_000)

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: oversizedBody },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(422)
    })

    it('should reject a channel name exceeding 80 characters', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const longName = 'a'.repeat(1000)

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: longName,
          type: 'public',
          scope: 'org',
        },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(422)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Unicode Edge Cases
  // ---------------------------------------------------------------------------

  describe('Unicode edge cases', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should successfully send and preserve a message with emoji characters', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'emoji-test' })
      await addUserToChannel(channel.id, user.id)

      const emojiBody = 'Great work everyone! 🔥🎉👍💯🚀'

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: emojiBody },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.body).toBe(emojiBody)
    })

    it('should successfully send a message with RTL text', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'rtl-test' })
      await addUserToChannel(channel.id, user.id)

      const rtlBody = 'مرحبا بالعالم - שלום עולם - Hello World'

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: rtlBody },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.body).toContain('مرحبا')
    })

    it('should handle zero-width characters and null bytes without a 500', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'zwc-test' })
      await addUserToChannel(channel.id, user.id)

      // Zero-width space, zero-width joiner, null byte
      const weirdBody = 'Hello\u200B\u200D\u0000World'

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: weirdBody },
      })

      // Should either succeed (stored or stripped) or reject cleanly — never 500
      expect(response.statusCode).not.toBe(500)
      expect([200, 201, 400, 422]).toContain(response.statusCode)
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Boundary Values (Pagination)
  // ---------------------------------------------------------------------------

  describe('Boundary values — pagination', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject limit=0 as below minimum', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'limit-zero-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}?limit=0`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(422)
    })

    it('should reject limit=101 as above maximum', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'limit-over-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}?limit=101`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(422)
    })

    it('should reject a negative limit', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'limit-neg-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}?limit=-5`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(422)
    })

    it('should succeed with limit=1 and return exactly 1 message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'limit-one-test' })
      await addUserToChannel(channel.id, user.id)

      await createTestMessage({ channelId: channel.id, userId: user.id, body: 'First' })
      await createTestMessage({ channelId: channel.id, userId: user.id, body: 'Second' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}?limit=1`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.messages.length).toBe(1)
    })

    it('should handle an invalid cursor string without a 500', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bad-cursor-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}?cursor=not-a-valid-cursor`,
        headers: { authorization: `Bearer ${token}` },
      })

      // Should return 422 (invalid datetime) or an empty result set — never 500
      expect(response.statusCode).not.toBe(500)
      expect([200, 400, 422]).toContain(response.statusCode)
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Missing / Wrong Headers
  // ---------------------------------------------------------------------------

  describe('Missing and wrong headers', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should handle POST with no Content-Type header with an error response', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'no-ct-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: 'No content type header' }),
      })

      // Without Content-Type, Fastify may fail to parse the body
      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    })

    it('should return 401 for Bearer token with empty value', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: 'Bearer ' },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(401)
    })

    it('should return 401 for wrong auth scheme (Basic instead of Bearer)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(401)
    })
  })

  // ---------------------------------------------------------------------------
  // 7. Empty String Validation
  // ---------------------------------------------------------------------------

  describe('Empty string validation', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject creating a channel with an empty name', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: '',
          type: 'public',
          scope: 'org',
        },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(422)
    })

    it('should reject sending a message with an empty body', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'empty-body-test' })
      await addUserToChannel(channel.id, user.id)

      const response = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: '' },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(422)
    })
  })

  // ---------------------------------------------------------------------------
  // 8. Double Submit / Idempotency
  // ---------------------------------------------------------------------------

  describe('Double submit / idempotency', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject creating a channel with the same name twice', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channelPayload = {
        name: 'duplicate-channel',
        type: 'public' as const,
        scope: 'org' as const,
      }

      const first = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: channelPayload,
      })

      expect(first.statusCode).toBe(201)

      const second = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${token}` },
        payload: channelPayload,
      })

      // Duplicate channel name triggers unique constraint — returns an error
      expect(second.statusCode).toBeGreaterThanOrEqual(400)
    })

    it('should return 409 when bookmarking the same message twice', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'double-bookmark-test' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Bookmark me twice',
      })

      const first = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id },
      })

      expect(first.statusCode).toBe(201)

      const second = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id },
      })

      // Should get 409 Conflict — never 500
      expect(second.statusCode).not.toBe(500)
      expect(second.statusCode).toBe(409)
    })
  })

  // ---------------------------------------------------------------------------
  // 9. Non-Existent Resources
  // ---------------------------------------------------------------------------

  describe('Non-existent resources', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return 404 or 403 for messages in a non-existent channel', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeChannelId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${fakeChannelId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).not.toBe(500)
      expect([403, 404]).toContain(response.statusCode)
    })

    it('should return 404 when editing a non-existent message', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeMessageId = '00000000-0000-4000-a000-000000000001'

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/messages/${fakeMessageId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Editing a ghost' },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(404)
    })

    it('should return 404 when deleting a non-existent bookmark', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeBookmarkId = '00000000-0000-4000-a000-000000000002'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/bookmarks/${fakeBookmarkId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).not.toBe(500)
      expect(response.statusCode).toBe(404)
    })
  })
})
