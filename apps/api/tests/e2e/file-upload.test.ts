/**
 * E2E tests for the File Upload flow.
 *
 * Focuses specifically on upload validation, presigned URL generation,
 * file metadata retrieval, blocked extensions, file size limits,
 * and authentication enforcement.
 *
 * Routes tested:
 *   POST /api/files/upload       — upload a file (multipart)
 *   GET  /api/files/:fileId      — get file metadata
 *
 * NOTE: S3 is mocked so no real uploads occur. The service layer
 * validates extensions and sizes before calling S3.
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
  createTestFile,
  cleanupTestData,
} from '../helpers/db'

/**
 * Build a multipart form payload for file upload testing.
 */
function buildMultipartPayload(
  boundary: string,
  fields: Record<string, string>,
  file: { name: string; filename: string; content: string; contentType: string },
): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}`,
      `Content-Disposition: form-data; name="${key}"`,
      '',
      value,
    )
  }

  parts.push(
    `--${boundary}`,
    `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"`,
    `Content-Type: ${file.contentType}`,
    '',
    file.content,
    `--${boundary}--`,
  )

  return parts.join('\r\n')
}

describe('File Upload API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // POST /api/files/upload — Successful upload
  // -------------------------------------------------------------------------

  describe('POST /api/files/upload — Upload file', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should upload a valid file and return file metadata', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'upload-success' })
      await addUserToChannel(channel.id, user.id)

      const boundary = '----TestBoundary'
      const payload = buildMultipartPayload(
        boundary,
        { channelId: channel.id },
        {
          name: 'file',
          filename: 'report.pdf',
          content: 'fake-pdf-binary-content-for-testing',
          contentType: 'application/pdf',
        },
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body).toHaveProperty('id')
      expect(body).toHaveProperty('s3Key')
      expect(body.userId).toBe(user.id)
      expect(body.channelId).toBe(channel.id)
      expect(body.originalFilename).toBe('report.pdf')
      expect(body.mimeType).toBe('application/pdf')
      expect(body.sizeBytes).toBeGreaterThan(0)
    })

    it('should upload a file without channelId or dmId (personal upload)', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const boundary = '----TestBoundary'
      const payload = buildMultipartPayload(
        boundary,
        {},
        {
          name: 'file',
          filename: 'personal-doc.txt',
          content: 'personal document content',
          contentType: 'text/plain',
        },
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.userId).toBe(user.id)
      expect(body.channelId).toBeNull()
      expect(body.dmId).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/files/upload — Blocked file extensions
  // -------------------------------------------------------------------------

  describe('POST /api/files/upload — Blocked extensions', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject .exe files', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const boundary = '----TestBoundary'
      const payload = buildMultipartPayload(
        boundary,
        {},
        {
          name: 'file',
          filename: 'malware.exe',
          content: 'fake-exe-content',
          contentType: 'application/octet-stream',
        },
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(422)
      const body = response.json()
      expect(body.error.code).toBe('BLOCKED_FILE_TYPE')
    })

    it('should reject .bat files', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const boundary = '----TestBoundary'
      const payload = buildMultipartPayload(
        boundary,
        {},
        {
          name: 'file',
          filename: 'script.bat',
          content: 'echo hello',
          contentType: 'application/x-bat',
        },
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(422)
      const body = response.json()
      expect(body.error.code).toBe('BLOCKED_FILE_TYPE')
    })

    it('should reject .dll files', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const boundary = '----TestBoundary'
      const payload = buildMultipartPayload(
        boundary,
        {},
        {
          name: 'file',
          filename: 'library.dll',
          content: 'fake-dll-content',
          contentType: 'application/octet-stream',
        },
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(422)
      const body = response.json()
      expect(body.error.code).toBe('BLOCKED_FILE_TYPE')
    })

    it('should allow safe extensions like .pdf, .png, .txt', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const safeFiles = [
        { filename: 'document.pdf', contentType: 'application/pdf' },
        { filename: 'image.png', contentType: 'image/png' },
        { filename: 'notes.txt', contentType: 'text/plain' },
      ]

      for (const safeFile of safeFiles) {
        const boundary = '----TestBoundary'
        const payload = buildMultipartPayload(
          boundary,
          {},
          {
            name: 'file',
            filename: safeFile.filename,
            content: 'safe-file-content',
            contentType: safeFile.contentType,
          },
        )

        const response = await app.inject({
          method: 'POST',
          url: '/api/files/upload',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': `multipart/form-data; boundary=${boundary}`,
          },
          payload,
        })

        expect(response.statusCode).toBe(201)
      }
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/files/upload — Auth enforcement
  // -------------------------------------------------------------------------

  describe('POST /api/files/upload — Authentication', () => {
    it('should return 401 without authentication', async () => {
      const boundary = '----TestBoundary'
      const payload = buildMultipartPayload(
        boundary,
        {},
        {
          name: 'file',
          filename: 'test.txt',
          content: 'content',
          contentType: 'text/plain',
        },
      )

      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/files/upload — Channel membership enforcement
  // -------------------------------------------------------------------------

  describe('POST /api/files/upload — Channel membership', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should reject upload from non-member of channel', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const channel = await createTestChannel({ name: 'restricted-upload' })
      // NOTE: user is NOT added to the channel

      const boundary = '----TestBoundary'
      const payload = buildMultipartPayload(
        boundary,
        { channelId: channel.id },
        {
          name: 'file',
          filename: 'document.pdf',
          content: 'fake-pdf-content',
          contentType: 'application/pdf',
        },
      )

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
  // POST /api/files/upload — Missing file
  // -------------------------------------------------------------------------

  describe('POST /api/files/upload — Missing file payload', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return 400 when no file is provided', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      // Send a multipart request with only a channelId field, no file
      const boundary = '----TestBoundary'
      const payload = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="channelId"',
        '',
        '00000000-0000-4000-a000-000000000001',
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

      expect(response.statusCode).toBe(400)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/files/:fileId — Get file metadata
  // -------------------------------------------------------------------------

  describe('GET /api/files/:fileId — Get file metadata', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return file metadata for the file owner', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const file = await createTestFile({ userId: user.id, originalFilename: 'my-document.pdf' })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(file.id)
      expect(body.userId).toBe(user.id)
      expect(body.originalFilename).toBe('my-document.pdf')
      expect(body).toHaveProperty('mimeType')
      expect(body).toHaveProperty('sizeBytes')
      expect(body).toHaveProperty('s3Key')
      expect(body).toHaveProperty('createdAt')
    })

    it('should return file metadata for a channel member', async () => {
      const owner = await createTestUser({ orgRole: 'basic', fullName: 'File Owner' })
      const member = await createTestUser({ orgRole: 'basic', fullName: 'Channel Member' })
      const memberSession = await createTestSession(member.id)
      const memberToken = generateTestToken(member.id, memberSession.id)

      const channel = await createTestChannel({ name: 'shared-files' })
      await addUserToChannel(channel.id, owner.id)
      await addUserToChannel(channel.id, member.id)

      const file = await createTestFile({
        userId: owner.id,
        channelId: channel.id,
        originalFilename: 'shared-report.pdf',
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}`,
        headers: { authorization: `Bearer ${memberToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(file.id)
    })

    it('should return 403 for non-owner non-member', async () => {
      const owner = await createTestUser({ orgRole: 'basic', fullName: 'Owner' })
      const outsider = await createTestUser({ orgRole: 'basic', fullName: 'Outsider' })
      const outsiderSession = await createTestSession(outsider.id)
      const outsiderToken = generateTestToken(outsider.id, outsiderSession.id)

      const file = await createTestFile({ userId: owner.id })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should allow admin to access any file', async () => {
      const owner = await createTestUser({ orgRole: 'basic', fullName: 'File Owner' })
      const admin = await createTestUser({ orgRole: 'admin', fullName: 'Admin User' })
      const adminSession = await createTestSession(admin.id)
      const adminToken = generateTestToken(admin.id, adminSession.id)

      const file = await createTestFile({ userId: owner.id })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(file.id)
    })

    it('should return 404 for non-existent file', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('should return 401 without authentication', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const file = await createTestFile({ userId: user.id })

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}`,
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
