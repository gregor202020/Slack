/**
 * Unit tests for canvas.service.ts.
 *
 * Tests canvas creation, updates, locking, unlocking,
 * version history, and template management.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import * as Y from 'yjs'

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
  getOrCreateCanvas,
  applyUpdate,
  lockCanvas,
  unlockCanvas,
  listVersions,
  listTemplates,
  createTemplate,
  deleteTemplate,
} from '../../../src/services/canvas.service.js'
import {
  createTestUser,
  createTestChannel,
  cleanupTestData,
} from '../../helpers/db'

describe('Canvas Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // getOrCreateCanvas
  // -------------------------------------------------------------------------

  describe('getOrCreateCanvas', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a new canvas for a channel', async () => {
      const channel = await createTestChannel({ name: 'canvas-new' })

      const result = await getOrCreateCanvas(channel.id)

      expect(result).toBeDefined()
      expect(result.channelId).toBe(channel.id)
      expect(result.yjsState).toBeDefined()
      expect(result.versionsCount).toBe(0)
    })

    it('should return existing canvas on subsequent calls', async () => {
      const channel = await createTestChannel({ name: 'canvas-existing' })

      const first = await getOrCreateCanvas(channel.id)
      const second = await getOrCreateCanvas(channel.id)

      expect(first.id).toBe(second.id)
    })
  })

  // -------------------------------------------------------------------------
  // applyUpdate
  // -------------------------------------------------------------------------

  describe('applyUpdate', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should apply a Yjs update to an existing canvas', async () => {
      const channel = await createTestChannel({ name: 'canvas-update' })
      const user = await createTestUser()
      await getOrCreateCanvas(channel.id)

      // Create a Yjs update
      const doc = new Y.Doc()
      const text = doc.getText('content')
      text.insert(0, 'Hello World')
      const update = Buffer.from(Y.encodeStateAsUpdate(doc))
      doc.destroy()

      const result = await applyUpdate(channel.id, update, user.id)

      expect(result).toBeDefined()
      expect(result.yjsState).toBeDefined()
    })

    it('should throw when canvas does not exist', async () => {
      const user = await createTestUser()
      const fakeChannelId = '00000000-0000-4000-a000-000000000000'

      const doc = new Y.Doc()
      const update = Buffer.from(Y.encodeStateAsUpdate(doc))
      doc.destroy()

      await expect(
        applyUpdate(fakeChannelId, update, user.id),
      ).rejects.toThrow()
    })

    it('should reject update when canvas is locked by another user', async () => {
      const channel = await createTestChannel({ name: 'canvas-locked' })
      const owner = await createTestUser()
      const other = await createTestUser()
      await getOrCreateCanvas(channel.id)

      // Lock canvas as owner
      await lockCanvas(channel.id, owner.id, 'admin')

      const doc = new Y.Doc()
      const update = Buffer.from(Y.encodeStateAsUpdate(doc))
      doc.destroy()

      await expect(
        applyUpdate(channel.id, update, other.id),
      ).rejects.toThrow('locked')
    })
  })

  // -------------------------------------------------------------------------
  // lockCanvas / unlockCanvas
  // -------------------------------------------------------------------------

  describe('lockCanvas', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should lock a canvas as admin', async () => {
      const channel = await createTestChannel({ name: 'canvas-lock' })
      const admin = await createTestUser({ orgRole: 'admin' })
      await getOrCreateCanvas(channel.id)

      const result = await lockCanvas(channel.id, admin.id, 'admin')

      expect(result.locked).toBe(true)
      expect(result.lockedBy).toBe(admin.id)
    })

    it('should lock a canvas as channel owner', async () => {
      const owner = await createTestUser()
      const channel = await createTestChannel({
        name: 'canvas-lock-owner',
        ownerUserId: owner.id,
      })
      await getOrCreateCanvas(channel.id)

      const result = await lockCanvas(channel.id, owner.id, 'basic')

      expect(result.locked).toBe(true)
    })

    it('should reject lock by non-owner non-admin', async () => {
      const owner = await createTestUser()
      const other = await createTestUser()
      const channel = await createTestChannel({
        name: 'canvas-lock-reject',
        ownerUserId: owner.id,
      })
      await getOrCreateCanvas(channel.id)

      await expect(
        lockCanvas(channel.id, other.id, 'basic'),
      ).rejects.toThrow()
    })

    it('should throw when canvas is already locked', async () => {
      const channel = await createTestChannel({ name: 'canvas-double-lock' })
      const admin = await createTestUser({ orgRole: 'admin' })
      await getOrCreateCanvas(channel.id)

      await lockCanvas(channel.id, admin.id, 'admin')

      await expect(
        lockCanvas(channel.id, admin.id, 'admin'),
      ).rejects.toThrow('already locked')
    })
  })

  describe('unlockCanvas', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should unlock a canvas by the user who locked it', async () => {
      const channel = await createTestChannel({ name: 'canvas-unlock' })
      const admin = await createTestUser({ orgRole: 'admin' })
      await getOrCreateCanvas(channel.id)
      await lockCanvas(channel.id, admin.id, 'admin')

      const result = await unlockCanvas(channel.id, admin.id, 'admin')

      expect(result.locked).toBe(false)
      expect(result.lockedBy).toBeNull()
    })

    it('should throw when canvas is not locked', async () => {
      const channel = await createTestChannel({ name: 'canvas-unlock-err' })
      const admin = await createTestUser({ orgRole: 'admin' })
      await getOrCreateCanvas(channel.id)

      await expect(
        unlockCanvas(channel.id, admin.id, 'admin'),
      ).rejects.toThrow('not locked')
    })

    it('should reject unlock by non-locker non-admin', async () => {
      const channel = await createTestChannel({ name: 'canvas-unlock-reject' })
      const locker = await createTestUser({ orgRole: 'admin' })
      const other = await createTestUser()
      await getOrCreateCanvas(channel.id)
      await lockCanvas(channel.id, locker.id, 'admin')

      await expect(
        unlockCanvas(channel.id, other.id, 'basic'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // listVersions
  // -------------------------------------------------------------------------

  describe('listVersions', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return empty list for canvas with no versions', async () => {
      const channel = await createTestChannel({ name: 'canvas-versions' })
      const c = await getOrCreateCanvas(channel.id)

      const result = await listVersions(c.id)

      expect(result.data).toEqual([])
      expect(result.pagination.total).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // Template management
  // -------------------------------------------------------------------------

  describe('template management', () => {
    it('should create and list templates', () => {
      const doc = new Y.Doc()
      const state = Buffer.from(Y.encodeStateAsUpdate(doc))
      doc.destroy()

      const template = createTemplate('Meeting Notes', state)

      expect(template.id).toBeDefined()
      expect(template.name).toBe('Meeting Notes')

      const templates = listTemplates()
      const found = templates.find((t: { id: string }) => t.id === template.id)
      expect(found).toBeDefined()
    })

    it('should delete a template', () => {
      const doc = new Y.Doc()
      const state = Buffer.from(Y.encodeStateAsUpdate(doc))
      doc.destroy()

      const template = createTemplate('To Delete', state)
      const result = deleteTemplate(template.id)

      expect(result.id).toBe(template.id)
    })

    it('should throw when deleting non-existent template', () => {
      expect(() => deleteTemplate('non-existent-id')).toThrow()
    })
  })
})
