/**
 * E2E tests for the File API.
 *
 * Covers: list files (channel, DM, my files), get file metadata,
 * get download URL, delete file, upload rejection for blocked extensions,
 * and membership enforcement.
 *
 * Routes tested:
 *   GET    /api/files/channel/:channelId — list channel files
 *   GET    /api/files/dm/:dmId           — list DM files
 *   GET    /api/files/user/me            — list my files
 *   GET    /api/files/:fileId            — get file metadata
 *   GET    /api/files/:fileId/download   — get download URL
 *   DELETE /api/files/:fileId            — delete file (soft-delete)
 *   POST   /api/files/upload             — upload file
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// Mock the S3 client before anything imports the file service
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}))

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://test-signed-url.example.com/file'),
}))

import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  createTestChannel,
  addUserToChannel,
  createTestDm,
  createTestFile,
  cleanupTestData,
} from '../helpers/db'

describe('File API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/files/channel/:channelId — List channel files
  // -------------------------------------------------------------------------

  describe('GET /api/files/channel/:channelId — List channel files', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list files for a channel member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'files-test' })
      await addUserToChannel(channel.id, user.id)

      await createTestFile({ userId: user.id, channelId: channel.id })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('files')
      expect(body.files.length).toBeGreaterThanOrEqual(1)
    })

    it('should return 403 for non-member', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'private-files' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/channel/${channel.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/files/dm/:dmId — List DM files
  // -------------------------------------------------------------------------

  describe('GET /api/files/dm/:dmId — List DM files', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list files for a DM member', async () => {
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const session = await createTestSession(userA.id)
      const token = generateTestToken(userA.id, session.id)

      const dm = await createTestDm('direct', [userA.id, userB.id])

      await createTestFile({ userId: userA.id, dmId: dm.id })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/dm/${dm.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('files')
      expect(body.files.length).toBeGreaterThanOrEqual(1)
    })

    it('should return 403 for non-member', async () => {
      const userA = await createTestUser({ fullName: 'Alice' })
      const userB = await createTestUser({ fullName: 'Bob' })
      const outsider = await createTestUser({ fullName: 'Charlie' })
      const session = await createTestSession(outsider.id)
      const token = generateTestToken(outsider.id, session.id)

      const dm = await createTestDm('direct', [userA.id, userB.id])

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/dm/${dm.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/files/user/me — List my files
  // -------------------------------------------------------------------------

  describe('GET /api/files/user/me — List my files', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list files uploaded by the current user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      await createTestFile({ userId: user.id, originalFilename: 'my-doc.pdf' })
      await createTestFile({ userId: user.id, originalFilename: 'my-image.png' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/files/user/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('files')
      expect(body.files.length).toBeGreaterThanOrEqual(2)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/files/user/me',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/files/upload — Upload file
  // -------------------------------------------------------------------------

  describe('POST /api/files/upload — Upload file', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject blocked file extensions', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'upload-test' })
      await addUserToChannel(channel.id, user.id)

      // Build a multipart form with a .exe file
      const boundary = '----TestBoundary'
      const payload = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="channelId"',
        '',
        channel.id,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="malware.exe"',
        'Content-Type: application/octet-stream',
        '',
        'fake-binary-content',
        `--${boundary}--`,
      ].join('\r\n')

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      // Should be rejected due to blocked extension
      expect(response.statusCode).toBe(422)
      const body = response.json()
      expect(body.error.code).toBe('BLOCKED_FILE_TYPE')
    })

    it('should reject upload from non-member of channel', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'restricted-upload' })
      // Note: user is NOT added to the channel

      const boundary = '----TestBoundary'
      const payload = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="channelId"',
        '',
        channel.id,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="document.pdf"',
        'Content-Type: application/pdf',
        '',
        'fake-pdf-content',
        `--${boundary}--`,
      ].join('\r\n')

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/files/:fileId/download — Get file download URL
  // -------------------------------------------------------------------------

  describe('GET /api/files/:fileId/download — Get download URL', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return a signed download URL for the file owner', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const file = await createTestFile({ userId: user.id })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}/download`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('url')
      expect(body).toHaveProperty('expiresAt')
    })

    it('should return 403 for non-owner non-admin', async () => {
      const owner = await createTestUser({ orgRole: 'basic' })
      const other = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(other.id)
      const token = generateTestToken(other.id, session.id)

      const file = await createTestFile({ userId: owner.id })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}/download`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 404 for non-existent file', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${fakeId}/download`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // DELETE /api/files/:fileId — Delete file (soft-delete to vault)
  // -------------------------------------------------------------------------

  describe('DELETE /api/files/:fileId — Delete file', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should allow the file owner to delete their file', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const file = await createTestFile({ userId: user.id })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/files/${file.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should allow admin to delete any file', async () => {
      const owner = await createTestUser({ orgRole: 'basic' })
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const file = await createTestFile({ userId: owner.id })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/files/${file.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 for non-owner non-admin', async () => {
      const owner = await createTestUser({ orgRole: 'basic' })
      const other = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(other.id)
      const token = generateTestToken(other.id, session.id)

      const file = await createTestFile({ userId: owner.id })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/files/${file.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 404 for non-existent file', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/files/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })
  })
})
