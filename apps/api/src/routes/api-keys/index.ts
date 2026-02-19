/**
 * API key routes — Create, list, rotate, revoke, update scopes.
 *
 * Spec references: Section 14
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/roles.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import { createApiKeySchema } from '@smoker/shared'
import {
  listApiKeys,
  createApiKey,
  getApiKeyById,
  updateScopes,
  updateIpAllowlist,
  rotateApiKey,
  revokeApiKey,
} from '../../services/api-key.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas for partial updates
// ---------------------------------------------------------------------------

const apiKeyScopeSchema = z.object({
  action: z.string().min(1),
  resource: z.string().min(1),
})

const updateScopesSchema = z.object({
  scopes: z.array(apiKeyScopeSchema).min(1, 'At least one scope is required'),
})

const updateIpAllowlistSchema = z.object({
  ipAllowlist: z.array(z.string()),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/api-keys — List API keys
  app.get('/', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (_request, reply) => {
      const result = await listApiKeys()
      return reply.status(200).send(result)
    },
  })

  // POST /api/admin/api-keys — Create a new API key
  app.post('/', {
    preHandler: [
      authenticate,
      requireRole('admin', 'super_admin'),
      validateBody(createApiKeySchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as {
        name: string
        scopes: { action: string; resource: string }[]
        ipAllowlist?: string[]
        rateLimit?: number
      }
      const result = await createApiKey(body, id, ipAddress, userAgent)
      return reply.status(201).send(result)
    },
  })

  // GET /api/admin/api-keys/:keyId — Get API key details
  app.get('/:keyId', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { keyId } = request.params as { keyId: string }
      const result = await getApiKeyById(keyId)
      return reply.status(200).send(result)
    },
  })

  // PATCH /api/admin/api-keys/:keyId/scopes — Update API key scopes
  app.patch('/:keyId/scopes', {
    preHandler: [
      authenticate,
      requireRole('admin', 'super_admin'),
      validateBody(updateScopesSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { keyId } = request.params as { keyId: string }
      const { scopes } = request.body as { scopes: { action: string; resource: string }[] }
      const result = await updateScopes(keyId, scopes, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // PATCH /api/admin/api-keys/:keyId/ip-allowlist — Update IP allowlist
  app.patch('/:keyId/ip-allowlist', {
    preHandler: [
      authenticate,
      requireRole('admin', 'super_admin'),
      validateBody(updateIpAllowlistSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { keyId } = request.params as { keyId: string }
      const { ipAllowlist } = request.body as { ipAllowlist: string[] }
      const result = await updateIpAllowlist(keyId, ipAllowlist, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // POST /api/admin/api-keys/:keyId/rotate — Rotate API key
  app.post('/:keyId/rotate', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { keyId } = request.params as { keyId: string }
      const result = await rotateApiKey(keyId, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // POST /api/admin/api-keys/:keyId/revoke — Revoke API key
  app.post('/:keyId/revoke', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { keyId } = request.params as { keyId: string }
      const result = await revokeApiKey(keyId, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })
}
