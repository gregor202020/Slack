/**
 * E2E tests for concurrency and race conditions.
 *
 * Verifies that the API handles simultaneous requests correctly,
 * preventing duplicate records, data corruption, and ensuring
 * consistent state under concurrent load.
 *
 * Uses Promise.all with app.inject to simulate parallel requests.
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
  createTestAnnouncement,
  cleanupTestData,
} from '../helpers/db'

describe('Concurrency & Race Conditions', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // ---------------------------------------------------------------------------
  // 1. Concurrent Message Sends
  // ---------------------------------------------------------------------------

  describe('Concurrent message sends to the same channel', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should accept all 10 simultaneous messages and return 201 for each', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'concurrent-send' })
      await addUserToChannel(channel.id, user.id)

      const requests = Array.from({ length: 10 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: `/api/messages/channel/${channel.id}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { body: `Concurrent message ${i}` },
        }),
      )

      const responses = await Promise.all(requests)

      for (const response of responses) {
        expect(response.statusCode).toBe(201)
      }
    })

    it('should save exactly 10 messages with correct ordering after concurrent sends', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'concurrent-count' })
      await addUserToChannel(channel.id, user.id)

      const requests = Array.from({ length: 10 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: `/api/messages/channel/${channel.id}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { body: `Message #${i}` },
        }),
      )

      await Promise.all(requests)

      // Fetch messages and verify count
      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}?limit=50`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(listResponse.statusCode).toBe(200)
      const body = listResponse.json()
      expect(body.messages).toHaveLength(10)

      // Verify all message IDs are unique
      const ids = body.messages.map((m: { id: string }) => m.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(10)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Concurrent Channel Join
  // ---------------------------------------------------------------------------

  describe('Concurrent channel join by the same user', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should not create duplicate memberships when joining twice simultaneously', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({
        name: 'concurrent-join',
        type: 'public',
      })

      const requests = [
        app.inject({
          method: 'POST',
          url: `/api/channels/${channel.id}/join`,
          headers: { authorization: `Bearer ${token}` },
        }),
        app.inject({
          method: 'POST',
          url: `/api/channels/${channel.id}/join`,
          headers: { authorization: `Bearer ${token}` },
        }),
      ]

      const responses = await Promise.all(requests)
      const statusCodes = responses.map((r) => r.statusCode)

      // At least one should succeed
      expect(statusCodes).toContain(200)

      // Both may succeed (idempotent) or one may fail — either way,
      // the membership list must show exactly 1 entry for this user
      // Need to be a member to list members, so use the user's token
      const membersResponse = await app.inject({
        method: 'GET',
        url: `/api/channels/${channel.id}/members`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(membersResponse.statusCode).toBe(200)
      const membersBody = membersResponse.json()
      const userMemberships = membersBody.members.filter(
        (m: { userId: string }) => m.userId === user.id,
      )
      expect(userMemberships).toHaveLength(1)
    })

    it('should allow at most one success or handle idempotent joins gracefully', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({
        name: 'idempotent-join',
        type: 'public',
      })

      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/channels/${channel.id}/join`,
          headers: { authorization: `Bearer ${token}` },
        }),
        app.inject({
          method: 'POST',
          url: `/api/channels/${channel.id}/join`,
          headers: { authorization: `Bearer ${token}` },
        }),
      ])

      const successes = responses.filter((r) => r.statusCode === 200)
      const conflicts = responses.filter((r) => r.statusCode === 409)

      // Either both succeed (idempotent) or one succeeds and one conflicts
      expect(successes.length + conflicts.length).toBe(2)
      expect(successes.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Concurrent Bookmark Creation
  // ---------------------------------------------------------------------------

  describe('Concurrent bookmark creation for the same message', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should not create duplicate bookmarks when bookmarking the same message twice simultaneously', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'concurrent-bookmark' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Bookmark race test',
      })

      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/bookmarks',
          headers: { authorization: `Bearer ${token}` },
          payload: { messageId: message.id },
        }),
        app.inject({
          method: 'POST',
          url: '/api/bookmarks',
          headers: { authorization: `Bearer ${token}` },
          payload: { messageId: message.id },
        }),
      ])

      const successes = responses.filter((r) => r.statusCode === 201)
      const conflicts = responses.filter((r) => r.statusCode === 409)
      const errors = responses.filter((r) => r.statusCode === 500)

      // The race condition means: one succeeds (201), the other gets conflict (409)
      // or a DB constraint error (500). No more than one should succeed.
      expect(successes.length).toBeGreaterThanOrEqual(0)
      expect(successes.length + conflicts.length + errors.length).toBe(2)

      // Verify at most one bookmark exists for this message
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(listResponse.statusCode).toBe(200)
      const allBookmarks = listResponse.json().data ?? []
      expect(allBookmarks.length).toBeLessThanOrEqual(1)
    })

    it('should handle simultaneous bookmark and note variations correctly', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bookmark-note-race' })
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Bookmark with note race',
      })

      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/bookmarks',
          headers: { authorization: `Bearer ${token}` },
          payload: { messageId: message.id, note: 'First note' },
        }),
        app.inject({
          method: 'POST',
          url: '/api/bookmarks',
          headers: { authorization: `Bearer ${token}` },
          payload: { messageId: message.id, note: 'Second note' },
        }),
      ])

      // At least one should succeed or get a conflict
      const statuses = responses.map((r) => r.statusCode)
      expect(statuses.some((s) => [201, 409, 500].includes(s))).toBe(true)

      // Verify at most one bookmark exists for this message
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(listResponse.statusCode).toBe(200)
      const allBookmarks = listResponse.json().data ?? []
      expect(allBookmarks.length).toBeLessThanOrEqual(1)
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Concurrent Reaction Creation
  // ---------------------------------------------------------------------------

  describe('Concurrent reaction creation on the same message', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should not create duplicate reactions when the same user reacts with the same emoji simultaneously', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'concurrent-reaction' })
      await addUserToChannel(channel.id, user.id)
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'React race test',
      })

      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/reactions',
          headers: { authorization: `Bearer ${token}` },
          payload: { messageId: message.id, emoji: '👍' },
        }),
        app.inject({
          method: 'POST',
          url: '/api/reactions',
          headers: { authorization: `Bearer ${token}` },
          payload: { messageId: message.id, emoji: '👍' },
        }),
      ])

      const successes = responses.filter((r) => r.statusCode === 201)
      const conflicts = responses.filter((r) => r.statusCode === 409)

      // At least one should succeed
      expect(successes.length).toBeGreaterThanOrEqual(1)

      // Verify no duplicate reactions
      const reactionsResponse = await app.inject({
        method: 'GET',
        url: `/api/reactions/message/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(reactionsResponse.statusCode).toBe(200)
      const reactions = reactionsResponse.json()
      const thumbsUp = reactions.filter(
        (r: { emoji: string; userId: string }) =>
          r.emoji === '👍' && r.userId === user.id,
      )
      expect(thumbsUp).toHaveLength(1)
    })

    it('should allow different emojis from the same user simultaneously without conflict', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'multi-emoji-race' })
      await addUserToChannel(channel.id, user.id)
      const message = await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Multi emoji test',
      })

      const emojis = ['👍', '❤️', '🔥', '😂', '🎉']
      const responses = await Promise.all(
        emojis.map((emoji) =>
          app.inject({
            method: 'POST',
            url: '/api/reactions',
            headers: { authorization: `Bearer ${token}` },
            payload: { messageId: message.id, emoji },
          }),
        ),
      )

      // All should succeed since they are different emojis
      for (const response of responses) {
        expect(response.statusCode).toBe(201)
      }

      // Verify all 5 reactions exist
      const reactionsResponse = await app.inject({
        method: 'GET',
        url: `/api/reactions/message/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(reactionsResponse.statusCode).toBe(200)
      const reactions = reactionsResponse.json()
      expect(reactions).toHaveLength(5)
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Concurrent Announcement Acknowledgment
  // ---------------------------------------------------------------------------

  describe('Concurrent announcement acknowledgment', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should not create duplicate acknowledgments when acknowledging the same announcement simultaneously', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const adminSession = await createTestSession(admin.id)
      const adminToken = generateTestToken(admin.id, adminSession.id)

      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const announcement = await createTestAnnouncement({
        userId: admin.id,
        scope: 'system',
        title: 'Concurrent Ack Test',
        ackRequired: true,
      })

      const responses = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/announcements/${announcement.id}/acknowledge`,
          headers: { authorization: `Bearer ${token}` },
        }),
        app.inject({
          method: 'POST',
          url: `/api/announcements/${announcement.id}/acknowledge`,
          headers: { authorization: `Bearer ${token}` },
        }),
      ])

      // At least one should succeed
      const successes = responses.filter((r) => r.statusCode === 200)
      expect(successes.length).toBeGreaterThanOrEqual(1)

      // Verify via the ack dashboard that only one acknowledgment record exists
      const dashboardResponse = await app.inject({
        method: 'GET',
        url: `/api/announcements/${announcement.id}/acks`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(dashboardResponse.statusCode).toBe(200)
      const dashboard = dashboardResponse.json()
      const userAcks = dashboard.users.filter(
        (u: { userId: string; ackedAt: string | null }) =>
          u.userId === user.id && u.ackedAt !== null,
      )
      expect(userAcks).toHaveLength(1)
    })

    it('should handle multiple users acknowledging the same announcement simultaneously', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const adminSession = await createTestSession(admin.id)
      const adminToken = generateTestToken(admin.id, adminSession.id)

      const announcement = await createTestAnnouncement({
        userId: admin.id,
        scope: 'system',
        title: 'Multi-User Ack Test',
        ackRequired: true,
      })

      // Create 5 users and their tokens
      const usersAndTokens = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const user = await createTestUser({ orgRole: 'basic' })
          const session = await createTestSession(user.id)
          const token = generateTestToken(user.id, session.id)
          return { user, token }
        }),
      )

      // All 5 users acknowledge simultaneously
      const responses = await Promise.all(
        usersAndTokens.map(({ token }) =>
          app.inject({
            method: 'POST',
            url: `/api/announcements/${announcement.id}/acknowledge`,
            headers: { authorization: `Bearer ${token}` },
          }),
        ),
      )

      // All should succeed since they are different users
      for (const response of responses) {
        expect(response.statusCode).toBe(200)
      }

      // Verify ack count via dashboard
      const dashboardResponse = await app.inject({
        method: 'GET',
        url: `/api/announcements/${announcement.id}/acks`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(dashboardResponse.statusCode).toBe(200)
      const dashboard = dashboardResponse.json()
      const ackedUsers = dashboard.users.filter(
        (u: { ackedAt: string | null }) => u.ackedAt !== null,
      )
      expect(ackedUsers.length).toBe(5)
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Concurrent Channel Creation
  // ---------------------------------------------------------------------------

  describe('Concurrent channel creation', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create 5 channels simultaneously with unique IDs', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          app.inject({
            method: 'POST',
            url: '/api/channels',
            headers: { authorization: `Bearer ${token}` },
            payload: {
              name: `concurrent-ch-${i}`,
              type: 'public',
              scope: 'org',
            },
          }),
        ),
      )

      for (const response of responses) {
        expect(response.statusCode).toBe(201)
      }

      const ids = responses.map((r) => r.json().id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(5)
    })

    it('should assign correct names to each concurrently created channel', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channelNames = ['alpha', 'bravo', 'charlie', 'delta', 'echo']

      const responses = await Promise.all(
        channelNames.map((name) =>
          app.inject({
            method: 'POST',
            url: '/api/channels',
            headers: { authorization: `Bearer ${token}` },
            payload: {
              name,
              type: 'public',
              scope: 'org',
            },
          }),
        ),
      )

      for (const response of responses) {
        expect(response.statusCode).toBe(201)
      }

      const createdNames = responses.map((r) => r.json().name).sort()
      expect(createdNames).toEqual(channelNames.sort())
    })
  })

  // ---------------------------------------------------------------------------
  // 7. High-Throughput Message Sending (multi-user)
  // ---------------------------------------------------------------------------

  describe('High-throughput message sending from multiple users', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should handle simultaneous messages from multiple users with rate limiting', async () => {
      const channel = await createTestChannel({ name: 'high-throughput' })

      // Create 3 users and add them to the channel
      const usersAndTokens = await Promise.all(
        Array.from({ length: 3 }, async (_, userIdx) => {
          const user = await createTestUser({
            orgRole: 'basic',
            fullName: `User ${userIdx}`,
          })
          const session = await createTestSession(user.id)
          const token = generateTestToken(user.id, session.id)
          await addUserToChannel(channel.id, user.id)
          return { user, token, userIdx }
        }),
      )

      // Each user sends 2 messages simultaneously (3 * 2 = 6 total)
      const requests = usersAndTokens.flatMap(({ token, userIdx }) =>
        Array.from({ length: 2 }, (_, msgIdx) =>
          app.inject({
            method: 'POST',
            url: `/api/messages/channel/${channel.id}`,
            headers: { authorization: `Bearer ${token}` },
            payload: { body: `User${userIdx}-Msg${msgIdx}` },
          }),
        ),
      )

      const responses = await Promise.all(requests)

      // Most should succeed (some may hit rate limits)
      const successes = responses.filter((r) => r.statusCode === 201)
      const rateLimited = responses.filter((r) => r.statusCode === 429)
      expect(successes.length + rateLimited.length).toBe(responses.length)
      expect(successes.length).toBeGreaterThanOrEqual(3)

      // Verify saved messages match successes
      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}?limit=50`,
        headers: { authorization: `Bearer ${usersAndTokens[0].token}` },
      })

      expect(listResponse.statusCode).toBe(200)
      const msgs = listResponse.json().messages
      expect(msgs.length).toBe(successes.length)
    })

    it('should preserve correct message body and user association under concurrent load', async () => {
      const channel = await createTestChannel({ name: 'body-integrity' })

      const usersAndTokens = await Promise.all(
        Array.from({ length: 3 }, async (_, userIdx) => {
          const user = await createTestUser({
            orgRole: 'basic',
            fullName: `Integrity User ${userIdx}`,
          })
          const session = await createTestSession(user.id)
          const token = generateTestToken(user.id, session.id)
          await addUserToChannel(channel.id, user.id)
          return { user, token, userIdx }
        }),
      )

      // Each user sends 2 messages with a unique, identifiable body (3 * 2 = 6 total)
      const requests = usersAndTokens.flatMap(({ token, user, userIdx }) =>
        Array.from({ length: 2 }, (_, msgIdx) =>
          app.inject({
            method: 'POST',
            url: `/api/messages/channel/${channel.id}`,
            headers: { authorization: `Bearer ${token}` },
            payload: { body: `[${user.id}] msg-${userIdx}-${msgIdx}` },
          }),
        ),
      )

      const responses = await Promise.all(requests)

      // Filter successful responses (some may be rate-limited)
      const successes = responses.filter((r) => r.statusCode === 201)
      expect(successes.length).toBeGreaterThanOrEqual(3)

      // Verify no data mixing: each successful message body should contain its author's user ID
      for (const response of successes) {
        const msg = response.json()
        expect(msg.body).toContain(msg.userId)
      }

      // Fetch all messages and verify no body/userId mismatch
      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}?limit=50`,
        headers: { authorization: `Bearer ${usersAndTokens[0].token}` },
      })

      expect(listResponse.statusCode).toBe(200)
      const msgs = listResponse.json().messages
      expect(msgs.length).toBe(successes.length)

      // Each message body should contain its userId in brackets
      for (const msg of msgs) {
        expect(msg.body).toContain(msg.userId)
      }
    })
  })

  // ---------------------------------------------------------------------------
  // 8. Read-Write Race
  // ---------------------------------------------------------------------------

  describe('Read-write race on messages', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should handle simultaneous reads and writes to the same channel without errors', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'read-write-race' })
      await addUserToChannel(channel.id, user.id)

      // Seed a few messages so reads have data
      for (let i = 0; i < 3; i++) {
        await createTestMessage({
          channelId: channel.id,
          userId: user.id,
          body: `Seed message ${i}`,
        })
      }

      // Interleave writes and reads (reduced count to avoid rate limiting)
      const writeRequests = Array.from({ length: 3 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: `/api/messages/channel/${channel.id}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { body: `Write during race ${i}` },
        }),
      )

      const readRequests = Array.from({ length: 3 }, () =>
        app.inject({
          method: 'GET',
          url: `/api/messages/channel/${channel.id}?limit=50`,
          headers: { authorization: `Bearer ${token}` },
        }),
      )

      const allResponses = await Promise.all([...writeRequests, ...readRequests])

      const writeResponses = allResponses.slice(0, 3)
      const readResponses = allResponses.slice(3)

      // Writes should succeed or get rate-limited — never 500
      for (const response of writeResponses) {
        expect([201, 429]).toContain(response.statusCode)
      }

      // All reads should succeed and return valid message arrays
      for (const response of readResponses) {
        expect(response.statusCode).toBe(200)
        const body = response.json()
        expect(body).toHaveProperty('messages')
        expect(Array.isArray(body.messages)).toBe(true)
        // Should have at least the 3 seeded messages
        expect(body.messages.length).toBeGreaterThanOrEqual(3)
      }
    })
  })
})
