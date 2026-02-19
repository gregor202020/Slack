/**
 * Search routes — Full-text search across messages, channels, users, etc.
 *
 * Spec references: Sections 10.1-10.4
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
  searchFiles,
} from '../../services/search.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas
// ---------------------------------------------------------------------------

const searchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const messageSearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  channelId: z.string().uuid().optional(),
  dmId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const basicSearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
})

const fileSearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/search — Search across all content types
  // Rate limit: 30 per minute per user (spec Section 16.2)
  app.get('/', {
    preHandler: [authenticate, validateQuery(searchQuerySchema)],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { q, cursor, limit } = request.query as z.infer<typeof searchQuerySchema>
      const result = await searchAll(q, id, orgRole, { cursor, limit })
      return reply.status(200).send(result)
    },
  })

  // GET /api/search/messages — Search messages only
  app.get('/messages', {
    preHandler: [authenticate, validateQuery(messageSearchQuerySchema)],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { q, channelId, dmId, cursor, limit } = request.query as z.infer<
        typeof messageSearchQuerySchema
      >
      const result = await searchMessages(q, id, orgRole, {
        channelId,
        dmId,
        cursor,
        limit,
      })
      return reply.status(200).send(result)
    },
  })

  // GET /api/search/channels — Search channels
  app.get('/channels', {
    preHandler: [authenticate, validateQuery(basicSearchQuerySchema)],
    handler: async (request, reply) => {
      const { q } = request.query as z.infer<typeof basicSearchQuerySchema>
      const result = await searchChannels(q)
      return reply.status(200).send(result)
    },
  })

  // GET /api/search/users — Search users
  app.get('/users', {
    preHandler: [authenticate, validateQuery(basicSearchQuerySchema)],
    handler: async (request, reply) => {
      const { q } = request.query as z.infer<typeof basicSearchQuerySchema>
      const result = await searchUsers(q)
      return reply.status(200).send(result)
    },
  })

  // GET /api/search/files — Search files
  app.get('/files', {
    preHandler: [authenticate, validateQuery(fileSearchQuerySchema)],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { q, cursor, limit } = request.query as z.infer<typeof fileSearchQuerySchema>
      const result = await searchFiles(q, id, orgRole, { cursor, limit })
      return reply.status(200).send(result)
    },
  })
}
