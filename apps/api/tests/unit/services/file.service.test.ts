/**
 * Unit tests for file.service.ts.
 *
 * Tests file retrieval, download URLs, deletion,
 * listing, and storage quota checks.
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
    DeleteObjectCommand: vi.fn(),
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(() => Promise.resolve('https://s3.example.com/signed-url')),
}))

import { loadConfig } from '../../../src/lib/config.js'
import {
  getFileById,
  getFileDownloadUrl,
  deleteFile,
  listChannelFiles,
  listMyFiles,
  getStorageUsage,
} from '../../../src/services/file.service.js'
import {
  createTestUser,
  createTestChannel,
  createTestFile,
  addUserToChannel,
  cleanupTestData,
} from '../../helpers/db'

describe('File Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // getFileById
  // -------------------------------------------------------------------------

  describe('getFileById', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a file by ID for the owner', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const file = await createTestFile({
        userId: user.id,
        channelId: channel.id,
      })

      const found = await getFileById(file.id, user.id, 'basic')

      expect(found.id).toBe(file.id)
      expect(found.originalFilename).toBe('test-file.txt')
    })

    it('should allow admin to access any file', async () => {
      const owner = await createTestUser()
      const admin = await createTestUser({ orgRole: 'admin' })
      const channel = await createTestChannel()
      const file = await createTestFile({
        userId: owner.id,
        channelId: channel.id,
      })

      const found = await getFileById(file.id, admin.id, 'admin')

      expect(found.id).toBe(file.id)
    })

    it('should throw for non-existent file', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getFileById(fakeId, user.id, 'basic')).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // getFileDownloadUrl
  // -------------------------------------------------------------------------

  describe('getFileDownloadUrl', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a signed download URL', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const file = await createTestFile({
        userId: user.id,
        channelId: channel.id,
      })

      const result = await getFileDownloadUrl(file.id, user.id, 'basic')

      expect(result.url).toBeDefined()
      expect(typeof result.url).toBe('string')
    })

    it('should throw for non-existent file', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        getFileDownloadUrl(fakeId, user.id, 'basic'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // deleteFile
  // -------------------------------------------------------------------------

  describe('deleteFile', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow the owner to delete their file', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      const file = await createTestFile({
        userId: user.id,
        channelId: channel.id,
      })

      await deleteFile(file.id, user.id, 'basic', '127.0.0.1', 'test-agent')

      await expect(
        getFileById(file.id, user.id, 'basic'),
      ).rejects.toThrow()
    })

    it('should allow admin to delete any file', async () => {
      const owner = await createTestUser()
      const admin = await createTestUser({ orgRole: 'admin' })
      const channel = await createTestChannel()
      const file = await createTestFile({
        userId: owner.id,
        channelId: channel.id,
      })

      await deleteFile(file.id, admin.id, 'admin', '127.0.0.1', 'test-agent')

      await expect(
        getFileById(file.id, admin.id, 'admin'),
      ).rejects.toThrow()
    })

    it('should throw for non-existent file', async () => {
      const user = await createTestUser()
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        deleteFile(fakeId, user.id, 'basic', '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })

    it('should reject deletion by non-owner non-admin', async () => {
      const owner = await createTestUser()
      const other = await createTestUser()
      const channel = await createTestChannel()
      const file = await createTestFile({
        userId: owner.id,
        channelId: channel.id,
      })

      await expect(
        deleteFile(file.id, other.id, 'basic', '127.0.0.1', 'test-agent'),
      ).rejects.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // listChannelFiles
  // -------------------------------------------------------------------------

  describe('listChannelFiles', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return files for a channel', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      await createTestFile({ userId: user.id, channelId: channel.id })
      await createTestFile({
        userId: user.id,
        channelId: channel.id,
        originalFilename: 'second.txt',
      })

      const result = await listChannelFiles(channel.id)

      expect(result.files.length).toBe(2)
    })

    it('should return empty list for channel with no files', async () => {
      const channel = await createTestChannel()

      const result = await listChannelFiles(channel.id)

      expect(result.files).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // listMyFiles
  // -------------------------------------------------------------------------

  describe('listMyFiles', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return files uploaded by the user', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      await createTestFile({ userId: user.id, channelId: channel.id })

      const result = await listMyFiles(user.id)

      expect(result.files.length).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // getStorageUsage
  // -------------------------------------------------------------------------

  describe('getStorageUsage', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return storage usage for a user', async () => {
      const user = await createTestUser()

      const usage = await getStorageUsage(user.id)

      expect(usage).toBeDefined()
      expect(typeof usage.used).toBe('number')
      expect(typeof usage.quota).toBe('number')
    })

    it('should reflect file uploads in usage count', async () => {
      const user = await createTestUser()
      const channel = await createTestChannel()
      await createTestFile({
        userId: user.id,
        channelId: channel.id,
        sizeBytes: 5000,
      })

      const usage = await getStorageUsage(user.id)

      expect(usage.used).toBeGreaterThanOrEqual(5000)
    })
  })
})
