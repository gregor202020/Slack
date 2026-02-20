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
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const counts = await getUnreadCounts(id)
      return reply.status(200).send(counts)
    },
  })

  // POST /api/unread/read — Mark a channel or DM as read
  app.post('/read', {
    preHandler: [authenticate, validateBody(markReadSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId, dmId } = request.body as { channelId?: string; dmId?: string }
      await markAsRead(id, channelId, dmId)
      return reply.status(200).send({ success: true })
    },
  })
}
