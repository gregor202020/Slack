/**
 * Reaction routes — Add, remove, and list emoji reactions.
 *
 * Spec references: Section 8.6
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import {
  addReaction,
  removeReaction,
  listReactions,
} from '../../services/message.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas
// ---------------------------------------------------------------------------

const addReactionSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(50),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function reactionRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/reactions — Add a reaction to a message
  // Rate limit: 30 per minute per user (spec Section 8.6)
  app.post('/', {
    preHandler: [authenticate, validateBody(addReactionSchema)],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const { id } = request.user!
      const { messageId, emoji } = request.body as { messageId: string; emoji: string }
      const reaction = await addReaction(messageId, emoji, id)
      return reply.status(201).send(reaction)
    },
  })

  // DELETE /api/reactions/:reactionId — Remove a reaction
  app.delete('/:reactionId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { reactionId } = request.params as { reactionId: string }
      const result = await removeReaction(reactionId, id)
      return reply.status(200).send(result)
    },
  })

  // GET /api/reactions/message/:messageId — List reactions for a message
  app.get('/message/:messageId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { messageId } = request.params as { messageId: string }
      const reactions = await listReactions(messageId)
      return reply.status(200).send(reactions)
    },
  })
}
