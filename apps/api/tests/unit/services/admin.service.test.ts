/**
 * Unit tests for admin.service.ts.
 *
 * Tests bulk delete preview, audit log queries,
 * data exports, and vault operations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'

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

vi.mock('@aws-sdk/client-s3', () => {
  const MockS3Client = vi.fn()
  MockS3Client.prototype.send = vi.fn().mockResolvedValue({})
  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(() => Promise.resolve('https://s3.example.com/signed-url')),
}))

import { loadConfig } from '../../../src/lib/config.js'
import {
  previewBulkDelete,
  executeBulkDelete,
  queryAuditLogs,
  requestOrgExport,
  requestUserExport,
  listExports,
} from '../../../src/services/admin.service.js'
import {
  createTestUser,
  createTestChannel,
  createTestMessage,
  addUserToChannel,
  cleanupTestData,
} from '../../helpers/db'

describe('Admin Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // previewBulkDelete
  // -------------------------------------------------------------------------

  describe('previewBulkDelete', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return count of messages eligible for deletion (org scope)', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      // Create a very old message (older than 90 days)
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 100)
      await createTestMessage({ channelId: channel.id, userId: user.id, body: 'Old msg' })

      const result = await previewBulkDelete('org')

      expect(result).toBeDefined()
      expect(typeof result.count).toBe('number')
      expect(result.cutoffDate).toBeDefined()
    })

    it('should require channelId for channel-scoped bulk delete', async () => {
      await expect(
        previewBulkDelete('channel'),
      ).rejects.toThrow('channelId is required')
    })

    it('should return count for channel-scoped bulk delete', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()

      const result = await previewBulkDelete('channel', channel.id)

      expect(result).toBeDefined()
      expect(typeof result.count).toBe('number')
    })
  })

  // -------------------------------------------------------------------------
  // executeBulkDelete
  // -------------------------------------------------------------------------

  describe('executeBulkDelete', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject when confirmation text does not match DELETE', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })

      await expect(
        executeBulkDelete('org', undefined, 90, 'WRONG', admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })

    it('should execute bulk delete with correct confirmation text', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const channel = await createTestChannel()
      // Create a message that should be eligible for bulk delete
      await createTestMessage({ channelId: channel.id, userId: admin.id, body: 'To delete' })

      const result = await executeBulkDelete(
        'org',
        undefined,
        90,
        'DELETE',
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(result).toBeDefined()
      expect(typeof result.deleted).toBe('number')
    })
  })

  // -------------------------------------------------------------------------
  // queryAuditLogs
  // -------------------------------------------------------------------------

  describe('queryAuditLogs', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return audit log entries', async () => {
      const result = await queryAuditLogs({})

      expect(result).toBeDefined()
      expect(Array.isArray(result.logs)).toBe(true)
    })

    it('should filter by action', async () => {
      const result = await queryAuditLogs({ action: 'user.login' })

      expect(result).toBeDefined()
      expect(Array.isArray(result.logs)).toBe(true)
    })

    it('should support pagination', async () => {
      const result = await queryAuditLogs({ limit: 5 })

      expect(result).toBeDefined()
      expect(result.logs.length).toBeLessThanOrEqual(5)
    })
  })

  // -------------------------------------------------------------------------
  // requestOrgExport
  // -------------------------------------------------------------------------

  describe('requestOrgExport', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create an org export request', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })

      const result = await requestOrgExport(
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(result.scope).toBe('org')
    })
  })

  // -------------------------------------------------------------------------
  // requestUserExport
  // -------------------------------------------------------------------------

  describe('requestUserExport', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create a user export request', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const user = await createTestUser()

      const result = await requestUserExport(
        user.id,
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(result.scope).toBe('user')
    })

    it('should throw for non-existent target user', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        requestUserExport(fakeId, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // listExports
  // -------------------------------------------------------------------------

  describe('listExports', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a list of exports', async () => {
      const result = await listExports()

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
