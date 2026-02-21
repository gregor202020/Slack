/**
 * E2E tests for the API Keys API.
 *
 * Covers: list, create, get details, update scopes,
 * update IP allowlist, rotate, revoke, and role enforcement.
 *
 * Routes tested:
 *   GET    /api/admin/api-keys                     — list API keys
 *   POST   /api/admin/api-keys                     — create API key
 *   GET    /api/admin/api-keys/:keyId              — get API key details
 *   PATCH  /api/admin/api-keys/:keyId/scopes       — update scopes
 *   PATCH  /api/admin/api-keys/:keyId/ip-allowlist  — update IP allowlist
 *   POST   /api/admin/api-keys/:keyId/rotate       — rotate API key
 *   POST   /api/admin/api-keys/:keyId/revoke       — revoke API key
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildTestApp } from '../helpers/app'
import { generateTestToken } from '../helpers/auth'
import {
  createTestUser,
  createTestSession,
  cleanupTestData,
} from '../helpers/db'

describe('API Keys API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildTestApp()
  })

  afterAll(async () => {
    await cleanupTestData()
    await app.close()
  })

  // -------------------------------------------------------------------------
  // GET /api/admin/api-keys — List API keys
  // -------------------------------------------------------------------------

  describe('GET /api/admin/api-keys — List API keys', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should list API keys for an admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/api-keys',
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/admin/api-keys — Create API key
  // -------------------------------------------------------------------------

  describe('POST /api/admin/api-keys — Create API key', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create an API key for an admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Test API Key',
          scopes: [{ action: 'read', resource: 'messages' }],
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.name).toBe('Test API Key')
      expect(body.key).toBeTruthy()
      expect(body.prefix).toBeTruthy()
    })

    it('should create an API key for a super_admin', async () => {
      const superAdmin = await createTestUser({ orgRole: 'super_admin' })
      const session = await createTestSession(superAdmin.id)
      const token = generateTestToken(superAdmin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Super Admin Key',
          scopes: [{ action: 'write', resource: 'channels' }],
          ipAllowlist: ['192.168.1.1'],
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.name).toBe('Super Admin Key')
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Unauthorized Key',
          scopes: [{ action: 'read', resource: 'messages' }],
        },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 422 for missing required fields', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Missing Scopes' },
      })

      expect(response.statusCode).toBe(422)
    })
  })

  // -------------------------------------------------------------------------
  // GET /api/admin/api-keys/:keyId — Get API key details
  // -------------------------------------------------------------------------

  describe('GET /api/admin/api-keys/:keyId — Get API key details', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return API key details for an admin', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create a key first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Details Test Key',
          scopes: [{ action: 'read', resource: 'users' }],
        },
      })
      const created = createResponse.json()

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/api-keys/${created.id}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe(created.id)
    })

    it('should return 404 for non-existent key', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/api-keys/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(404)
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/api-keys/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/admin/api-keys/:keyId/scopes — Update scopes
  // -------------------------------------------------------------------------

  describe('PATCH /api/admin/api-keys/:keyId/scopes — Update scopes', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update scopes for an existing API key', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create a key first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Scope Test Key',
          scopes: [{ action: 'read', resource: 'messages' }],
        },
      })
      const created = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/api-keys/${created.id}/scopes`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          scopes: [
            { action: 'read', resource: 'messages' },
            { action: 'write', resource: 'channels' },
          ],
        },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should return 422 for empty scopes array', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Empty Scope Test',
          scopes: [{ action: 'read', resource: 'messages' }],
        },
      })
      const created = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/api-keys/${created.id}/scopes`,
        headers: { authorization: `Bearer ${token}` },
        payload: { scopes: [] },
      })

      expect(response.statusCode).toBe(422)
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/api-keys/${fakeId}/scopes`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          scopes: [{ action: 'read', resource: 'messages' }],
        },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // PATCH /api/admin/api-keys/:keyId/ip-allowlist — Update IP allowlist
  // -------------------------------------------------------------------------

  describe('PATCH /api/admin/api-keys/:keyId/ip-allowlist — Update IP allowlist', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update IP allowlist for an existing API key', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create a key first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'IP Allowlist Test Key',
          scopes: [{ action: 'read', resource: 'messages' }],
        },
      })
      const created = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/api-keys/${created.id}/ip-allowlist`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          ipAllowlist: ['10.0.0.1/32', '192.168.1.0/24'],
        },
      })

      expect(response.statusCode).toBe(200)
    })

    it('should allow clearing IP allowlist with empty array', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Clear IP Test',
          scopes: [{ action: 'read', resource: 'messages' }],
          ipAllowlist: ['10.0.0.1/32'],
        },
      })
      const created = createResponse.json()

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/api-keys/${created.id}/ip-allowlist`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ipAllowlist: [] },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/admin/api-keys/:keyId/rotate — Rotate API key
  // -------------------------------------------------------------------------

  describe('POST /api/admin/api-keys/:keyId/rotate — Rotate API key', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should rotate an API key and return a new key value', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create a key first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Rotate Test Key',
          scopes: [{ action: 'read', resource: 'messages' }],
        },
      })
      const created = createResponse.json()
      const originalKey = created.key

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/api-keys/${created.id}/rotate`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.key).toBeTruthy()
      expect(body.key).not.toBe(originalKey)
      expect(body.prefix).toBeTruthy()
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/api-keys/${fakeId}/rotate`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  // -------------------------------------------------------------------------
  // POST /api/admin/api-keys/:keyId/revoke — Revoke API key
  // -------------------------------------------------------------------------

  describe('POST /api/admin/api-keys/:keyId/revoke — Revoke API key', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should revoke an API key', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const session = await createTestSession(admin.id)
      const token = generateTestToken(admin.id, session.id)

      // Create a key first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Revoke Test Key',
          scopes: [{ action: 'read', resource: 'messages' }],
        },
      })
      const created = createResponse.json()

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/api-keys/${created.id}/revoke`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.success).toBe(true)
    })

    it('should return 403 for basic user', async () => {
      const user = await createTestUser({ orgRole: 'basic' })
      const session = await createTestSession(user.id)
      const token = generateTestToken(user.id, session.id)

      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/api-keys/${fakeId}/revoke`,
        headers: { authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(403)
    })

    it('should return 401 without authentication', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/api-keys/${fakeId}/revoke`,
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
