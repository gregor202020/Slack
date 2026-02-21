/**
 * Unread message routes — fetch unread counts and mark channels/DMs as read.
 *
 * Routes:
 *   GET  /api/unread      — Get all unread counts for the authenticated user
 *   POST /api/unread/read — Mark a channel or DM as read
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { getUnreadCounts, markAsRead } from '../../services/unread.service.js'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const markReadSchema = z.object({
  channelId: z.string().uuid('Invalid channel ID').optional(),
  dmId: z.string().uuid('Invalid DM ID').optional(),
}).refine(
  (data) => data.channelId || data.dmId,
  { message: 'Either channelId or dmId must be provided' },
)

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function unreadRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/unread — Get all unread counts
  app.get('/', {
    schema: {
      summary: 'Get unread counts',
      description: 'Returns unread message counts for all channels and DMs the user is a member of.',
      tags: ['Unread'],
      response: {
        200: {
          type: 'object',
          properties: {
            channels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  channelId: { type: 'string', format: 'uuid' },
                  unreadCount: { type: 'integer' },
                  mentionCount: { type: 'integer' },
                },
              },
            },
            dms: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  dmId: { type: 'string', format: 'uuid' },
                  unreadCount: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const counts = await getUnreadCounts(id)
      return reply.status(200).send(counts)
    },
  })

  // POST /api/unread/read — Mark a channel or DM as read
  app.post('/read', {
    schema: {
      summary: 'Mark as read',
      description: 'Marks all messages in a channel or DM as read. Provide either channelId or dmId.',
      tags: ['Unread'],
      body: {
        type: 'object',
        properties: {
          channelId: { type: 'string', format: 'uuid', description: 'Channel to mark as read' },
          dmId: { type: 'string', format: 'uuid', description: 'DM to mark as read' },
        },
      },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
        422: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
    preHandler: [authenticate, validateBody(markReadSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId, dmId } = request.body as { channelId?: string; dmId?: string }
      await markAsRead(id, channelId, dmId)
      return reply.status(200).send({ success: true })
    },
  })
}
