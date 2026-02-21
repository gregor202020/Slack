/**
 * Search routes -- Full-text search across messages, channels, users.
 *
 * GET /api/search?q=term&type=all|messages|channels|users&cursor=...&limit=25
 *
 * All endpoints require authentication. Query must be 2-100 characters.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { validateQuery } from '../../middleware/validate.js'
import {
  searchAll,
  searchMessages,
  searchChannels,
  searchUsers,
} from '../../services/search.service.js'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const searchQuerySchema = z.object({
  q: z.string().min(2).max(100),
  type: z.enum(['all', 'messages', 'channels', 'users']).default('all'),
  channelId: z.string().uuid().optional(),
  dmId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/search — Unified search endpoint with type filter
  app.get('/', {
    schema: {
      summary: 'Search',
      description: 'Full-text search across messages, channels, and users. Filterable by type, channel, or DM.',
      tags: ['Search'],
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', minLength: 2, maxLength: 100, description: 'Search query (2-100 characters)' },
          type: { type: 'string', enum: ['all', 'messages', 'channels', 'users'], default: 'all', description: 'Result type filter' },
          channelId: { type: 'string', format: 'uuid', description: 'Limit message search to a channel' },
          dmId: { type: 'string', format: 'uuid', description: 'Limit message search to a DM' },
          cursor: { type: 'string', description: 'Cursor for pagination' },
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Results per page' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            messages: {
              type: 'object',
              properties: {
                data: { type: 'array', items: { type: 'object' } },
                nextCursor: { type: 'string', nullable: true },
              },
            },
            channels: {
              type: 'array',
              items: { type: 'object' },
            },
            users: {
              type: 'array',
              items: { type: 'object' },
            },
          },
        },
        422: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
    preHandler: [authenticate, validateQuery(searchQuerySchema)],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { q, type, channelId, dmId, cursor, limit } = request.query as z.infer<
        typeof searchQuerySchema
      >

      switch (type) {
        case 'messages': {
          const result = await searchMessages(q, id, orgRole, {
            channelId,
            dmId,
            cursor,
            limit,
          })
          return reply.status(200).send(result)
        }

        case 'channels': {
          const result = await searchChannels(q, id, orgRole)
          return reply.status(200).send(result)
        }

        case 'users': {
          const result = await searchUsers(q)
          return reply.status(200).send(result)
        }

        case 'all':
        default: {
          const result = await searchAll(q, id, orgRole, { cursor, limit })
          return reply.status(200).send(result)
        }
      }
    },
  })
}
