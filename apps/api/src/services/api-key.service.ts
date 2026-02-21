/**
 * API key service layer.
 *
 * Handles creation, listing, scope updates, IP allowlist management,
 * key rotation, and revocation of API keys.
 *
 * DB schema for api_keys:
 *   id, name, keyHash, scopes (jsonb: {action,resource}[]),
 *   ipAllowlist (jsonb: string[]), rateLimit, createdBy, createdAt, revokedAt
 */

import { eq, desc } from 'drizzle-orm'
import { db, apiKeys } from '@smoker/db'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'
import { generateToken, hashToken } from '../lib/crypto.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApiKeyScope = { action: string; resource: string }

/** Basic CIDR validation regex (IPv4/prefix). */
const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/

// ---------------------------------------------------------------------------
// 1. listApiKeys
// ---------------------------------------------------------------------------

/**
 * Return all API keys (metadata only, never the key itself).
 */
export async function listApiKeys() {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      scopes: apiKeys.scopes,
      ipAllowlist: apiKeys.ipAllowlist,
      rateLimit: apiKeys.rateLimit,
      createdBy: apiKeys.createdBy,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt))

  return rows
}

// ---------------------------------------------------------------------------
// 2. createApiKey
// ---------------------------------------------------------------------------

/**
 * Create a new API key. Returns the plaintext key exactly once.
 */
export async function createApiKey(
  data: {
    name: string
    scopes: ApiKeyScope[]
    ipAllowlist?: string[]
    rateLimit?: number
  },
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const rawKey = generateToken(32)
  const keyHash = hashToken(rawKey)
  const keyPrefix = rawKey.slice(0, 8)

  const [created] = await db
    .insert(apiKeys)
    .values({
      name: data.name,
      keyHash,
      scopes: data.scopes,
      ipAllowlist: data.ipAllowlist ?? [],
      rateLimit: data.rateLimit ?? 1000,
      createdBy: actorId,
    })
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'api_key.created',
    targetType: 'api_key',
    targetId: created!.id,
    metadata: {
      name: data.name,
      scopes: data.scopes,
      keyPrefix,
    },
    ipAddress,
    userAgent,
  })

  return {
    id: created!.id,
    name: created!.name,
    key: rawKey,
    prefix: keyPrefix,
    scopes: created!.scopes,
  }
}

// ---------------------------------------------------------------------------
// 3. getApiKeyById
// ---------------------------------------------------------------------------

/**
 * Retrieve API key metadata by ID (never the key itself).
 */
export async function getApiKeyById(keyId: string) {
  const [row] = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      scopes: apiKeys.scopes,
      ipAllowlist: apiKeys.ipAllowlist,
      rateLimit: apiKeys.rateLimit,
      createdBy: apiKeys.createdBy,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.id, keyId))
    .limit(1)

  if (!row) {
    throw new NotFoundError('API key not found', 'API_KEY_NOT_FOUND')
  }

  return row
}

// ---------------------------------------------------------------------------
// 4. updateScopes
// ---------------------------------------------------------------------------

/**
 * Update the scopes of an existing API key.
 */
export async function updateScopes(
  keyId: string,
  scopes: ApiKeyScope[],
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const existing = await getApiKeyById(keyId)

  const [updated] = await db
    .update(apiKeys)
    .set({ scopes })
    .where(eq(apiKeys.id, keyId))
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'api_key.scopes_updated',
    targetType: 'api_key',
    targetId: keyId,
    metadata: {
      previousScopes: existing.scopes,
      newScopes: scopes,
    },
    ipAddress,
    userAgent,
  })

  return updated
}

// ---------------------------------------------------------------------------
// 5. updateIpAllowlist
// ---------------------------------------------------------------------------

/**
 * Update the IP allowlist of an existing API key.
 * Validates basic CIDR format for each entry.
 */
export async function updateIpAllowlist(
  keyId: string,
  ipAllowlist: string[],
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  // Validate CIDR format
  for (const cidr of ipAllowlist) {
    if (!CIDR_REGEX.test(cidr)) {
      throw new ValidationError(
        `Invalid CIDR format: ${cidr}`,
        'INVALID_CIDR_FORMAT',
      )
    }
  }

  const existing = await getApiKeyById(keyId)

  const [updated] = await db
    .update(apiKeys)
    .set({ ipAllowlist })
    .where(eq(apiKeys.id, keyId))
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'api_key.ip_allowlist_updated',
    targetType: 'api_key',
    targetId: keyId,
    metadata: {
      previousIpAllowlist: existing.ipAllowlist,
      newIpAllowlist: ipAllowlist,
    },
    ipAddress,
    userAgent,
  })

  return updated
}

// ---------------------------------------------------------------------------
// 6. rotateApiKey
// ---------------------------------------------------------------------------

/**
 * Rotate an API key — generate a new key, invalidate the old one immediately.
 * Returns the new plaintext key (shown once).
 */
export async function rotateApiKey(
  keyId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  // Verify key exists
  await getApiKeyById(keyId)

  const rawKey = generateToken(32)
  const keyHash = hashToken(rawKey)
  const keyPrefix = rawKey.slice(0, 8)

  await db
    .update(apiKeys)
    .set({ keyHash })
    .where(eq(apiKeys.id, keyId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'api_key.rotated',
    targetType: 'api_key',
    targetId: keyId,
    metadata: { newKeyPrefix: keyPrefix },
    ipAddress,
    userAgent,
  })

  return { key: rawKey, prefix: keyPrefix }
}

// ---------------------------------------------------------------------------
// 7. revokeApiKey
// ---------------------------------------------------------------------------

/**
 * Revoke an API key by setting revokedAt.
 */
export async function revokeApiKey(
  keyId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  // Verify key exists
  await getApiKeyById(keyId)

  const [updated] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId))
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'api_key.revoked',
    targetType: 'api_key',
    targetId: keyId,
    ipAddress,
    userAgent,
  })

  return updated
}
