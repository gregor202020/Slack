/**
 * Unit tests for api-key.service.ts.
 *
 * Tests API key creation, listing, scope updates,
 * IP allowlist validation, rotation, and revocation.
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

import { loadConfig } from '../../../src/lib/config.js'
import {
  listApiKeys,
  createApiKey,
  getApiKeyById,
  updateScopes,
  updateIpAllowlist,
  rotateApiKey,
  revokeApiKey,
} from '../../../src/services/api-key.service.js'
import {
  createTestUser,
  cleanupTestData,
} from '../../helpers/db'

describe('API Key Service', () => {
  beforeAll(() => {
    loadConfig()
  })

  afterAll(async () => {
    await cleanupTestData()
  })

  // -------------------------------------------------------------------------
  // createApiKey
  // -------------------------------------------------------------------------

  describe('createApiKey', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should create an API key and return the plaintext key once', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })

      const result = await createApiKey(
        {
          name: 'Test Key',
          scopes: [{ action: 'read', resource: 'messages' }],
        },
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(result.name).toBe('Test Key')
      expect(result.key).toBeDefined()
      expect(result.key.length).toBeGreaterThan(0)
      expect(result.prefix).toBe(result.key.slice(0, 8))
    })

    it('should create API key with IP allowlist', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })

      const result = await createApiKey(
        {
          name: 'IP Restricted Key',
          scopes: [{ action: 'read', resource: 'users' }],
          ipAllowlist: ['192.168.1.0/24'],
          rateLimit: 500,
        },
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(result).toBeDefined()
      expect(result.name).toBe('IP Restricted Key')
    })
  })

  // -------------------------------------------------------------------------
  // listApiKeys
  // -------------------------------------------------------------------------

  describe('listApiKeys', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return all API keys', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      await createApiKey(
        { name: 'Key 1', scopes: [] },
        admin.id, '127.0.0.1', 'test-agent',
      )
      await createApiKey(
        { name: 'Key 2', scopes: [] },
        admin.id, '127.0.0.1', 'test-agent',
      )

      const keys = await listApiKeys()

      expect(keys.length).toBe(2)
    })

    it('should return empty list when no keys exist', async () => {
      const keys = await listApiKeys()

      expect(keys).toEqual([])
    })

    it('should not return the key hash (security)', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      await createApiKey(
        { name: 'Secure Key', scopes: [] },
        admin.id, '127.0.0.1', 'test-agent',
      )

      const keys = await listApiKeys()

      // The returned keys should not contain keyHash
      expect(keys[0]).not.toHaveProperty('keyHash')
    })
  })

  // -------------------------------------------------------------------------
  // getApiKeyById
  // -------------------------------------------------------------------------

  describe('getApiKeyById', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should return API key metadata by ID', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const created = await createApiKey(
        { name: 'Get By Id', scopes: [{ action: 'read', resource: 'channels' }] },
        admin.id, '127.0.0.1', 'test-agent',
      )

      const found = await getApiKeyById(created.id)

      expect(found.id).toBe(created.id)
      expect(found.name).toBe('Get By Id')
    })

    it('should throw for non-existent key', async () => {
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(getApiKeyById(fakeId)).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // updateScopes
  // -------------------------------------------------------------------------

  describe('updateScopes', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update the scopes of an API key', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const key = await createApiKey(
        { name: 'Scope Update', scopes: [{ action: 'read', resource: 'messages' }] },
        admin.id, '127.0.0.1', 'test-agent',
      )

      const newScopes = [
        { action: 'read', resource: 'messages' },
        { action: 'write', resource: 'messages' },
      ]

      const updated = await updateScopes(
        key.id,
        newScopes,
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(updated).toBeDefined()
    })
  })

  // -------------------------------------------------------------------------
  // updateIpAllowlist
  // -------------------------------------------------------------------------

  describe('updateIpAllowlist', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should update the IP allowlist', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const key = await createApiKey(
        { name: 'IP Update', scopes: [] },
        admin.id, '127.0.0.1', 'test-agent',
      )

      const updated = await updateIpAllowlist(
        key.id,
        ['10.0.0.0/8', '192.168.0.0/16'],
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(updated).toBeDefined()
    })

    it('should reject invalid CIDR format', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const key = await createApiKey(
        { name: 'Bad CIDR', scopes: [] },
        admin.id, '127.0.0.1', 'test-agent',
      )

      await expect(
        updateIpAllowlist(
          key.id,
          ['not-a-cidr'],
          admin.id,
          '127.0.0.1',
          'test-agent',
        ),
      ).rejects.toThrow('Invalid CIDR')
    })
  })

  // -------------------------------------------------------------------------
  // rotateApiKey
  // -------------------------------------------------------------------------

  describe('rotateApiKey', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should generate a new key for an existing API key', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const original = await createApiKey(
        { name: 'Rotate Me', scopes: [] },
        admin.id, '127.0.0.1', 'test-agent',
      )

      const rotated = await rotateApiKey(
        original.id,
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(rotated.key).toBeDefined()
      expect(rotated.key).not.toBe(original.key)
    })

    it('should throw for non-existent key', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        rotateApiKey(fakeId, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not found')
    })
  })

  // -------------------------------------------------------------------------
  // revokeApiKey
  // -------------------------------------------------------------------------

  describe('revokeApiKey', () => {
    beforeEach(async () => {
      await cleanupTestData()
    })

    it('should revoke an API key', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const key = await createApiKey(
        { name: 'Revoke Me', scopes: [] },
        admin.id, '127.0.0.1', 'test-agent',
      )

      const revoked = await revokeApiKey(
        key.id,
        admin.id,
        '127.0.0.1',
        'test-agent',
      )

      expect(revoked).toBeDefined()
      expect(revoked!.revokedAt).not.toBeNull()
    })

    it('should throw for non-existent key', async () => {
      const admin = await createTestUser({ orgRole: 'admin' })
      const fakeId = '00000000-0000-4000-a000-000000000000'

      await expect(
        revokeApiKey(fakeId, admin.id, '127.0.0.1', 'test-agent'),
      ).rejects.toThrow('not found')
    })
  })
})
