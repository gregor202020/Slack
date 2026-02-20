/**
 * Unit tests for the Search service.
 *
 * NOTE: The core helper `toTsQuery()` in search.service.ts is NOT exported
 * (it is a private function). Therefore, it cannot be directly unit-tested
 * in isolation. The search logic — including toTsQuery conversion, permission
 * filtering, and result formatting — is fully exercised by the E2E tests
 * in tests/e2e/search.test.ts, which hit the real PostgreSQL full-text
 * search pipeline through the API routes.
 *
 * If toTsQuery is exported in the future, add direct unit tests here.
 *
 * The tests below verify the public search functions via the database layer,
 * confirming that the service correctly applies access control rules.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

// Mock socket.io and firebase before importing anything
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
  searchMessages,
  searchChannels,
  searchUsers,
  searchAll,
} from '../../../src/services/search.service.js'
import {
  createTestUser,
  createTestSession,
  createTestChannel,
  addUserToChannel,
  createTestMessage,
  cleanupTestData,
} from '../../helpers/db'

describe('Search Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // searchMessages
  // -------------------------------------------------------------------------

  describe('searchMessages()', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return matching messages for a member of the channel', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const channel = await createTestChannel({ name: 'unit-search-msgs' })
      await addUserToChannel(channel.id, user.id)

      await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'Electromagnetic interference disrupted the satellite communication',
      })

      const result = await searchMessages('electromagnetic', user.id, 'basic')

      expect(result.messages.length).toBeGreaterThanOrEqual(1)
      expect(result.messages[0].body).toContain('Electromagnetic')
    })

    it('should not return messages from channels the user is not a member of (private)', async () => {
      const author = await createTestUser({ orgRole: 'basic' })
      const outsider = await createTestUser({ orgRole: 'basic' })

      const privateChannel = await createTestChannel({
        name: 'unit-private-search',
        type: 'private',
      })
      await addUserToChannel(privateChannel.id, author.id)

      await createTestMessage({
        channelId: privateChannel.id,
        userId: author.id,
        body: 'Confidential microprocessor architecture design specifications',
      })

      const result = await searchMessages('microprocessor', outsider.id, 'basic')

      expect(result.messages.length).toBe(0)
    })

    it('should allow admin to see all messages regardless of membership', async () => {
      const author = await createTestUser({ orgRole: 'basic' })
      const admin = await createTestUser({ orgRole: 'admin' })

      const privateChannel = await createTestChannel({
        name: 'unit-admin-search',
        type: 'private',
      })
      await addUserToChannel(privateChannel.id, author.id)

      await createTestMessage({
        channelId: privateChannel.id,
        userId: author.id,
        body: 'Topographical surveying equipment calibration procedure documentation',
      })

      const result = await searchMessages('topographical', admin.id, 'admin')

      expect(result.messages.length).toBeGreaterThanOrEqual(1)
    })

    it('should return empty results for empty query after tokenization', async () => {
      const user = await createTestUser({ orgRole: 'basic' })

      const result = await searchMessages('!!!', user.id, 'basic')

      expect(result.messages).toEqual([])
      expect(result.nextCursor).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // searchChannels
  // -------------------------------------------------------------------------

  describe('searchChannels()', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return public channels matching the query', async () => {
      const user = await createTestUser({ orgRole: 'basic' })

      await createTestChannel({ name: 'oceanography-research', type: 'public' })

      const result = await searchChannels('oceanography', user.id, 'basic')

      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].name).toContain('oceanography')
    })

    it('should return private channels the user is a member of', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const privateChannel = await createTestChannel({
        name: 'seismology-private',
        type: 'private',
      })
      await addUserToChannel(privateChannel.id, user.id)

      const result = await searchChannels('seismology', user.id, 'basic')

      expect(result.length).toBeGreaterThanOrEqual(1)
    })
  })

  // -------------------------------------------------------------------------
  // searchUsers
  // -------------------------------------------------------------------------

  describe('searchUsers()', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return users matching the name query', async () => {
      await createTestUser({ fullName: 'Cornelius Bartholomew Weatherington' })

      const result = await searchUsers('Cornelius')

      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(result[0].fullName).toContain('Cornelius')
    })

    it('should not return suspended users', async () => {
      await createTestUser({
        fullName: 'Persephone Nightingale',
        status: 'suspended',
      })

      const result = await searchUsers('Persephone')

      expect(result.length).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // searchAll
  // -------------------------------------------------------------------------

  describe('searchAll()', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return messages, channels, and users in a single response', async () => {
      const user = await createTestUser({
        orgRole: 'basic',
        fullName: 'Volcanology Researcher',
      })
      const channel = await createTestChannel({
        name: 'volcanology-updates',
        type: 'public',
      })
      await addUserToChannel(channel.id, user.id)

      await createTestMessage({
        channelId: channel.id,
        userId: user.id,
        body: 'The volcanology department released new findings about magma chambers',
      })

      const result = await searchAll('volcanology', user.id, 'basic')

      expect(result).toHaveProperty('messages')
      expect(result).toHaveProperty('channels')
      expect(result).toHaveProperty('users')
    })
  })
})
