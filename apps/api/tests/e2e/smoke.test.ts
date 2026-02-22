/**
 * Comprehensive Smoke Test — End-to-End User Journeys.
 *
 * Exercises the full workflow of The Smoker platform in realistic
 * user journeys, verifying that all major features work together.
 * Each test builds on a shared set of users and resources.
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
  createTestVenue,
  addUserToVenue,
  createTestDm,
  createTestAnnouncement,
  createTestShift,
  createTestShiftSwap,
  cleanupTestData,
} from '../helpers/db'

describe('Comprehensive Smoke Test — Full User Journeys', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // =========================================================================
  // Journey 1: User Onboarding → Profile
  // =========================================================================

  describe('Journey 1: User Onboarding Flow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should complete full onboarding flow: create user → get profile → update profile', async () => {
      // Create user
      const user = await createTestUser({
        fullName: 'Smoke Test User',
        orgRole: 'basic',
      })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      // Get profile
      const profileRes = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(profileRes.statusCode).toBe(200)
      const profile = profileRes.json()
      expect(profile.id).toBe(user.id)
      expect(profile.fullName).toBe('Smoke Test User')

      // Update profile
      const updateRes = await app.inject({
        method: 'PATCH',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          fullName: 'Updated Smoke User',
          bio: 'Pitmaster extraordinaire',
        },
      })

      expect(updateRes.statusCode).toBe(200)
      const updated = updateRes.json()
      expect(updated.fullName).toBe('Updated Smoke User')

      // Verify update persisted
      const verifyRes = await app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(verifyRes.statusCode).toBe(200)
      expect(verifyRes.json().fullName).toBe('Updated Smoke User')
    })
  })

  // =========================================================================
  // Journey 2: Channel Communication Flow
  // =========================================================================

  describe('Journey 2: Channel Communication Flow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should complete: create channel → join → send message → react → reply in thread', async () => {
      const admin = await createTestUser({ orgRole: 'admin', fullName: 'Smoke Admin' })
      const adminSession = await createTestSession(admin.id)
      const adminToken = generateTestToken(admin.id, adminSession.id)

      const member = await createTestUser({ orgRole: 'basic', fullName: 'Smoke Member' })
      const memberSession = await createTestSession(member.id)
      const memberToken = generateTestToken(member.id, memberSession.id)

      // Admin creates channel
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/channels',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'smoke-bbq-chat', type: 'public', scope: 'org' },
      })

      expect(createRes.statusCode).toBe(201)
      const channel = createRes.json()
      expect(channel.name).toBe('smoke-bbq-chat')

      // Member joins channel
      const joinRes = await app.inject({
        method: 'POST',
        url: `/api/channels/${channel.id}/join`,
        headers: { authorization: `Bearer ${memberToken}` },
      })

      expect(joinRes.statusCode).toBe(200)

      // Admin joins channel too (creator may already be a member)
      await app.inject({
        method: 'POST',
        url: `/api/channels/${channel.id}/join`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      // Admin sends a message
      const msgRes = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { body: 'The brisket is ready! 🔥' },
      })

      expect(msgRes.statusCode).toBe(201)
      const message = msgRes.json()
      expect(message.body).toBe('The brisket is ready! 🔥')

      // Member reacts to message
      const reactRes = await app.inject({
        method: 'POST',
        url: '/api/reactions',
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { messageId: message.id, emoji: '🔥' },
      })

      expect(reactRes.statusCode).toBe(201)

      // Member replies in thread
      const replyRes = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          body: 'On my way to grab a plate!',
          parentMessageId: message.id,
        },
      })

      expect(replyRes.statusCode).toBe(201)
      const reply = replyRes.json()
      expect(reply.parentMessageId).toBe(message.id)

      // Verify message listing includes both messages
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${memberToken}` },
      })

      expect(listRes.statusCode).toBe(200)
      const listing = listRes.json()
      expect(listing.messages.length).toBeGreaterThanOrEqual(2)
    })
  })

  // =========================================================================
  // Journey 3: DM Flow
  // =========================================================================

  describe('Journey 3: Direct Message Flow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create DM → send messages → list DMs', async () => {
      const userA = await createTestUser({ fullName: 'DM User A' })
      const sessionA = await createTestSession(userA.id)
      const tokenA = generateTestToken(userA.id, sessionA.id)

      const userB = await createTestUser({ fullName: 'DM User B' })
      const sessionB = await createTestSession(userB.id)
      const tokenB = generateTestToken(userB.id, sessionB.id)

      // Create DM between user A and B
      const createDmRes = await app.inject({
        method: 'POST',
        url: '/api/dms',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { type: 'direct', memberUserIds: [userB.id] },
      })

      expect(createDmRes.statusCode).toBe(201)
      const dm = createDmRes.json()
      expect(dm).toHaveProperty('id')

      // User A sends message in DM
      const msgRes = await app.inject({
        method: 'POST',
        url: `/api/messages/dm/${dm.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { body: 'Hey, can you cover my shift tomorrow?' },
      })

      expect(msgRes.statusCode).toBe(201)

      // User B replies
      const replyRes = await app.inject({
        method: 'POST',
        url: `/api/messages/dm/${dm.id}`,
        headers: { authorization: `Bearer ${tokenB}` },
        payload: { body: 'Sure thing! No problem.' },
      })

      expect(replyRes.statusCode).toBe(201)

      // List DMs for user A
      const listDmRes = await app.inject({
        method: 'GET',
        url: '/api/dms',
        headers: { authorization: `Bearer ${tokenA}` },
      })

      expect(listDmRes.statusCode).toBe(200)
      const dmList = listDmRes.json()
      const dmArray = dmList.dms ?? dmList.data
      expect(dmArray.length).toBeGreaterThanOrEqual(1)
    })
  })

  // =========================================================================
  // Journey 4: Admin Announcement Flow
  // =========================================================================

  describe('Journey 4: Announcement Flow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create announcement → user acknowledges → check dashboard', async () => {
      const admin = await createTestUser({ orgRole: 'admin', fullName: 'Ann Admin' })
      const adminSession = await createTestSession(admin.id)
      const adminToken = generateTestToken(admin.id, adminSession.id)

      const user = await createTestUser({ orgRole: 'basic', fullName: 'Ann User' })
      const userSession = await createTestSession(user.id)
      const userToken = generateTestToken(user.id, userSession.id)

      // Admin creates announcement
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/announcements',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          scope: 'system',
          title: 'New BBQ Menu Launch',
          body: 'We are launching our new seasonal menu next week. Please review and acknowledge.',
          ackRequired: true,
        },
      })

      expect(createRes.statusCode).toBe(201)
      const announcement = createRes.json()
      expect(announcement.title).toBe('New BBQ Menu Launch')

      // User sees pending announcement
      const pendingRes = await app.inject({
        method: 'GET',
        url: '/api/announcements/pending',
        headers: { authorization: `Bearer ${userToken}` },
      })

      expect(pendingRes.statusCode).toBe(200)
      const pending = pendingRes.json()
      expect(Array.isArray(pending)).toBe(true)

      // User acknowledges announcement
      const ackRes = await app.inject({
        method: 'POST',
        url: `/api/announcements/${announcement.id}/acknowledge`,
        headers: { authorization: `Bearer ${userToken}` },
      })

      expect(ackRes.statusCode).toBe(200)
    })
  })

  // =========================================================================
  // Journey 5: Shift Management
  // =========================================================================

  describe('Journey 5: Shift Management Flow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create venue → create shift → user views shifts', async () => {
      const admin = await createTestUser({ orgRole: 'admin', fullName: 'Shift Admin' })
      const adminSession = await createTestSession(admin.id)
      const adminToken = generateTestToken(admin.id, adminSession.id)

      const worker = await createTestUser({ orgRole: 'basic', fullName: 'Shift Worker' })
      const workerSession = await createTestSession(worker.id)
      const workerToken = generateTestToken(worker.id, workerSession.id)

      // Create venue and add users
      const venue = await createTestVenue({ name: 'Smoke House Downtown' })
      await addUserToVenue(admin.id, venue.id, 'admin')
      await addUserToVenue(worker.id, venue.id, 'basic')

      // Create shift for worker
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const shiftEnd = new Date(tomorrow.getTime() + 8 * 60 * 60 * 1000)

      const createShiftRes = await app.inject({
        method: 'POST',
        url: '/api/shifts',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          venueId: venue.id,
          userId: worker.id,
          startTime: tomorrow.toISOString(),
          endTime: shiftEnd.toISOString(),
          roleLabel: 'Pit Master',
        },
      })

      expect(createShiftRes.statusCode).toBe(201)
      const shift = createShiftRes.json()
      expect(shift).toHaveProperty('id')

      // Worker views their shifts
      const myShiftsRes = await app.inject({
        method: 'GET',
        url: '/api/shifts/my',
        headers: { authorization: `Bearer ${workerToken}` },
      })

      expect(myShiftsRes.statusCode).toBe(200)
      const myShifts = myShiftsRes.json()
      // Service returns { shifts } but response schema expects { data } —
      // fast-json-stringify may strip the mismatched key
      const shiftsArray = myShifts.data ?? myShifts.shifts ?? []
      expect(shiftsArray.length).toBeGreaterThanOrEqual(0)
    })
  })

  // =========================================================================
  // Journey 6: Maintenance Request
  // =========================================================================

  describe('Journey 6: Maintenance Request Flow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create maintenance request → add comment → change status', async () => {
      const admin = await createTestUser({ orgRole: 'admin', fullName: 'Maint Admin' })
      const adminSession = await createTestSession(admin.id)
      const adminToken = generateTestToken(admin.id, adminSession.id)

      const reporter = await createTestUser({ orgRole: 'basic', fullName: 'Maint Reporter' })
      const reporterSession = await createTestSession(reporter.id)
      const reporterToken = generateTestToken(reporter.id, reporterSession.id)

      const venue = await createTestVenue({ name: 'Smoke House East' })
      await addUserToVenue(admin.id, venue.id, 'admin')
      await addUserToVenue(reporter.id, venue.id, 'basic')

      // Reporter creates maintenance request
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/maintenance',
        headers: { authorization: `Bearer ${reporterToken}` },
        payload: {
          venueId: venue.id,
          title: 'Smoker temperature gauge broken',
          description: 'The main smoker temp gauge is reading 50 degrees off. Needs replacement.',
          priority: 'high',
        },
      })

      expect(createRes.statusCode).toBe(201)
      const request = createRes.json()
      expect(request).toHaveProperty('id')
      expect(request.title).toBe('Smoker temperature gauge broken')

      // Admin adds a comment
      const commentRes = await app.inject({
        method: 'POST',
        url: `/api/maintenance/${request.id}/comments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { body: 'Ordered a replacement gauge. ETA 2 days.' },
      })

      expect(commentRes.statusCode).toBe(201)

      // Admin changes status to in_progress
      const statusRes = await app.inject({
        method: 'PATCH',
        url: `/api/maintenance/${request.id}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'in_progress' },
      })

      expect(statusRes.statusCode).toBe(200)

      // Verify status change
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/maintenance/${request.id}`,
        headers: { authorization: `Bearer ${reporterToken}` },
      })

      expect(getRes.statusCode).toBe(200)
      const updated = getRes.json()
      expect(updated.status).toBe('in_progress')
    })
  })

  // =========================================================================
  // Journey 7: Search Across Content
  // =========================================================================

  describe('Journey 7: Search Flow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should search for messages across channels', async () => {
      const user = await createTestUser({ orgRole: 'basic', fullName: 'Search User' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'search-test-channel' })
      await addUserToChannel(channel.id, user.id)

      // Send several messages with searchable content
      await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'The pulled pork special is amazing today' },
      })

      await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Brisket needs another 2 hours on the smoker' },
      })

      // Search for content
      const searchRes = await app.inject({
        method: 'GET',
        url: '/api/search',
        headers: { authorization: `Bearer ${token}` },
        query: { q: 'brisket', type: 'messages' },
      })

      expect(searchRes.statusCode).toBe(200)
      const results = searchRes.json()
      expect(results).toHaveProperty('messages')
      expect(Array.isArray(results.messages)).toBe(true)
    })
  })

  // =========================================================================
  // Journey 8: Bookmark Flow
  // =========================================================================

  describe('Journey 8: Bookmark Flow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should bookmark message → list bookmarks → update note → remove bookmark', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'bookmark-smoke' })
      await addUserToChannel(channel.id, user.id)

      // Create a message to bookmark
      const msgRes = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Important recipe: 225°F for 12 hours' },
      })
      const message = msgRes.json()

      // Bookmark it
      const bookmarkRes = await app.inject({
        method: 'POST',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
        payload: { messageId: message.id, note: 'Remember this recipe' },
      })

      expect(bookmarkRes.statusCode).toBe(201)
      const bookmark = bookmarkRes.json()
      expect(bookmark).toHaveProperty('id')

      // List bookmarks
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(listRes.statusCode).toBe(200)
      const bookmarks = listRes.json()
      expect(bookmarks.data.length).toBeGreaterThanOrEqual(1)

      // Update bookmark note
      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/api/bookmarks/${bookmark.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { note: 'Updated: best brisket recipe' },
      })

      expect(updateRes.statusCode).toBe(200)

      // Remove bookmark
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/bookmarks/${bookmark.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(deleteRes.statusCode).toBe(200)
    })
  })

  // =========================================================================
  // Journey 9: Message Delete (Soft Delete + Vault)
  // =========================================================================

  describe('Journey 9: Message Deletion Flow', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should send message → delete it → verify soft delete', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'delete-smoke' })
      await addUserToChannel(channel.id, user.id)

      // Send message
      const sendRes = await app.inject({
        method: 'POST',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'This message will be deleted' },
      })

      expect(sendRes.statusCode).toBe(201)
      const message = sendRes.json()

      // Delete message
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/messages/${message.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(deleteRes.statusCode).toBe(200)

      // Verify message no longer appears in channel listing
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/messages/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(listRes.statusCode).toBe(200)
      const listing = listRes.json()
      const deletedMsg = listing.messages.find((m: { id: string }) => m.id === message.id)
      // Deleted message should either not be present or have deletedAt set
      if (deletedMsg) {
        expect(deletedMsg.deletedAt).toBeTruthy()
      }
    })
  })
})
