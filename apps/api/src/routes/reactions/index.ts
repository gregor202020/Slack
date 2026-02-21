/**
 * Reaction routes — Add, remove, and list emoji reactions.
 *
 * Spec references: Section 8.6
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { authenticate } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { NotFoundError, ForbiddenError } from '../../lib/errors.js'
import { db, messages, channelMembers, dmMembers } from '@smoker/db'
import {
  addReaction,
  removeReaction,
  listReactions,
} from '../../services/message.service.js'

// ---------------------------------------------------------------------------
// Helper: assert that the requesting user has access to the message's
// channel or DM (prevents unauthorized reactions).
// ---------------------------------------------------------------------------

async function assertMessageAccess(messageId: string, userId: string): Promise<void> {
  const [msg] = await db
    .select({ channelId: messages.channelId, dmId: messages.dmId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)

  if (!msg) throw new NotFoundError('Message not found')

  if (msg.channelId) {
    const [member] = await db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(and(eq(channelMembers.channelId, msg.channelId), eq(channelMembers.userId, userId)))
      .limit(1)
    if (!member) throw new ForbiddenError('Not a member of this channel')
  } else if (msg.dmId) {
    const [member] = await db
      .select({ dmId: dmMembers.dmId })
      .from(dmMembers)
      .where(and(eq(dmMembers.dmId, msg.dmId), eq(dmMembers.userId, userId)))
      .limit(1)
    if (!member) throw new ForbiddenError('Not a member of this DM')
  }
}

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
    schema: {
      summary: 'Add reaction',
      description: 'Adds an emoji reaction to a message. Requires access to the message.',
      tags: ['Reactions'],
      body: {
        type: 'object',
        required: ['messageId', 'emoji'],
        properties: {
          messageId: { type: 'string', format: 'uuid', description: 'Message to react to' },
          emoji: { type: 'string', minLength: 1, maxLength: 50, description: 'Emoji character or shortcode' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            messageId: { type: 'string', format: 'uuid' },
            emoji: { type: 'string' },
            userId: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        403: {
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
        404: {
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
      await assertMessageAccess(messageId, id)
      const reaction = await addReaction(messageId, emoji, id)
      return reply.status(201).send(reaction)
    },
  })

  // DELETE /api/reactions/:reactionId — Remove a reaction
  app.delete('/:reactionId', {
    schema: {
      summary: 'Remove reaction',
      description: 'Removes a reaction. Only the user who added the reaction can remove it.',
      tags: ['Reactions'],
      params: {
        type: 'object',
        required: ['reactionId'],
        properties: {
          reactionId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
        403: {
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
    schema: {
      summary: 'List message reactions',
      description: 'Returns all reactions for a specific message.',
      tags: ['Reactions'],
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              emoji: { type: 'string' },
              userId: { type: 'string', format: 'uuid' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { messageId } = request.params as { messageId: string }
      await assertMessageAccess(messageId, request.user!.id)
      const reactions = await listReactions(messageId)
      return reply.status(200).send(reactions)
    },
  })
}
