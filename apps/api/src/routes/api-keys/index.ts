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
    schema: {
      summary: 'List API keys',
      description: 'Returns all API keys. Admin or Super admin only.',
      tags: ['API Keys'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              prefix: { type: 'string', description: 'First 8 characters of the key' },
              scopes: { type: 'array', items: { type: 'object', properties: { action: { type: 'string' }, resource: { type: 'string' } } } },
              createdAt: { type: 'string', format: 'date-time' },
              lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
            },
          },
        },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (_request, reply) => {
      const result = await listApiKeys()
      return reply.status(200).send(result)
    },
  })

  // POST /api/admin/api-keys — Create a new API key
  app.post('/', {
    schema: {
      summary: 'Create API key',
      description: 'Creates a new API key with specified scopes. Admin or Super admin only.',
      tags: ['API Keys'],
      body: {
        type: 'object',
        required: ['name', 'scopes'],
        properties: {
          name: { type: 'string', description: 'Descriptive name for the API key' },
          scopes: {
            type: 'array',
            items: { type: 'object', required: ['action', 'resource'], properties: { action: { type: 'string' }, resource: { type: 'string' } } },
            minItems: 1,
          },
          ipAllowlist: { type: 'array', items: { type: 'string' }, description: 'Allowed IP addresses' },
          rateLimit: { type: 'integer', description: 'Custom rate limit (requests per minute)' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            key: { type: 'string', description: 'Full API key (only shown once)' },
            prefix: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
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
    schema: {
      summary: 'Get API key details',
      description: 'Returns details for a specific API key.',
      tags: ['API Keys'],
      params: { type: 'object', required: ['keyId'], properties: { keyId: { type: 'string', format: 'uuid' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            scopes: { type: 'array', items: { type: 'object', additionalProperties: true } },
            ipAllowlist: { type: 'array', items: { type: 'string' }, nullable: true },
            rateLimit: { type: 'integer', nullable: true },
            createdBy: { type: 'string', format: 'uuid' },
            revokedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { keyId } = request.params as { keyId: string }
      const result = await getApiKeyById(keyId)
      return reply.status(200).send(result)
    },
  })

  // PATCH /api/admin/api-keys/:keyId/scopes — Update API key scopes
  app.patch('/:keyId/scopes', {
    schema: {
      summary: 'Update API key scopes',
      description: 'Replaces the scopes on an API key.',
      tags: ['API Keys'],
      params: { type: 'object', required: ['keyId'], properties: { keyId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['scopes'],
        properties: {
          scopes: {
            type: 'array',
            items: { type: 'object', required: ['action', 'resource'], properties: { action: { type: 'string' }, resource: { type: 'string' } } },
            minItems: 1,
          },
        },
      },
      response: {
        200: { type: 'object' },
      },
    },
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
    schema: {
      summary: 'Update IP allowlist',
      description: 'Updates the IP allowlist for an API key.',
      tags: ['API Keys'],
      params: { type: 'object', required: ['keyId'], properties: { keyId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['ipAllowlist'],
        properties: {
          ipAllowlist: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        200: { type: 'object' },
      },
    },
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
    schema: {
      summary: 'Rotate API key',
      description: 'Generates a new key value while preserving the key metadata.',
      tags: ['API Keys'],
      params: { type: 'object', required: ['keyId'], properties: { keyId: { type: 'string', format: 'uuid' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'New API key value (only shown once)' },
            prefix: { type: 'string' },
          },
        },
      },
    },
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
    schema: {
      summary: 'Revoke API key',
      description: 'Permanently revokes an API key, disabling all future requests.',
      tags: ['API Keys'],
      params: { type: 'object', required: ['keyId'], properties: { keyId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { keyId } = request.params as { keyId: string }
      await revokeApiKey(keyId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })
}
