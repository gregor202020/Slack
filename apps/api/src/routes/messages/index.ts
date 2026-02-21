/**
 * Message routes — Send, edit, delete, thread replies, edit history.
 *
 * Spec references: Sections 8.1-8.10
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { authenticate } from '../../middleware/auth.js'
import { requireChannelMembership, requireDmMembership } from '../../middleware/roles.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import { NotFoundError, ForbiddenError } from '../../lib/errors.js'
import { sendMessageSchema, editMessageSchema, paginationQuerySchema } from '@smoker/shared'
import { db, messages, channelMembers, dmMembers } from '@smoker/db'
import {
  getChannelMessages,
  sendChannelMessage,
  sendDmMessage,
  getMessageById,
  editMessage,
  deleteMessage,
  getThreadReplies,
  getMessageVersions,
  getDmMessages,
} from '../../services/message.service.js'
import { getLinkPreviews } from '../../services/link-preview.service.js'

// ---------------------------------------------------------------------------
// Helper: assert that the requesting user has access to the message's
// channel or DM (prevents IDOR on message endpoints).
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

const dmMessageSchema = z.object({
  body: z.string().min(1).max(40_000),
  parentMessageId: z.string().uuid().optional(),
})

const threadReplySchema = z.object({
  body: z.string().min(1).max(40_000),
})

// ---------------------------------------------------------------------------
// Shared schema fragments
// ---------------------------------------------------------------------------

const errorResponse = {
  type: 'object' as const,
  properties: {
    error: {
      type: 'object' as const,
      properties: {
        code: { type: 'string' as const },
        message: { type: 'string' as const },
      },
    },
  },
}

const messageResponse = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' },
    body: { type: 'string' as const },
    senderId: { type: 'string' as const, format: 'uuid' },
    channelId: { type: 'string' as const, format: 'uuid', nullable: true },
    dmId: { type: 'string' as const, format: 'uuid', nullable: true },
    parentMessageId: { type: 'string' as const, format: 'uuid', nullable: true },
    threadReplyCount: { type: 'integer' as const },
    isEdited: { type: 'boolean' as const },
    createdAt: { type: 'string' as const, format: 'date-time' },
    updatedAt: { type: 'string' as const, format: 'date-time' },
  },
}

const paginatedMessagesResponse = {
  type: 'object' as const,
  properties: {
    data: {
      type: 'array' as const,
      items: messageResponse,
    },
    nextCursor: { type: 'string' as const, nullable: true },
  },
}

const paginationQuery = {
  type: 'object' as const,
  properties: {
    cursor: { type: 'string' as const, description: 'Cursor for pagination' },
    limit: { type: 'integer' as const, minimum: 1, maximum: 100, default: 25 },
  },
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/messages/channel/:channelId — Get channel messages (paginated)
  app.get('/channel/:channelId', {
    schema: {
      summary: 'Get channel messages',
      description: 'Returns paginated messages for a channel. Requires channel membership.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['channelId'],
        properties: {
          channelId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: paginationQuery,
      response: {
        200: paginatedMessagesResponse,
        422: errorResponse,
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await getChannelMessages(channelId, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // POST /api/messages/channel/:channelId — Send a message to a channel
  // Rate limit: 30 per minute per user (spec Section 8.10)
  app.post('/channel/:channelId', {
    schema: {
      summary: 'Send channel message',
      description: 'Sends a message to a channel. Supports threaded replies via parentMessageId.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['channelId'],
        properties: {
          channelId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 40000, description: 'Message content' },
          parentMessageId: { type: 'string', format: 'uuid', description: 'Parent message ID for thread replies' },
        },
      },
      response: {
        201: messageResponse,
        403: errorResponse,
        422: errorResponse,
      },
    },
    preHandler: [
      authenticate,
      requireChannelMembership('channelId'),
      validateBody(sendMessageSchema),
    ],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      const { body, parentMessageId } = request.body as {
        body: string
        parentMessageId?: string
      }
      const message = await sendChannelMessage(channelId, body, id, parentMessageId)
      return reply.status(201).send(message)
    },
  })

  // POST /api/messages/dm/:dmId — Send a message to a DM
  app.post('/dm/:dmId', {
    schema: {
      summary: 'Send DM message',
      description: 'Sends a message to a direct message conversation. Supports threaded replies.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['dmId'],
        properties: {
          dmId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 40000 },
          parentMessageId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        201: messageResponse,
        403: errorResponse,
      },
    },
    preHandler: [
      authenticate,
      requireDmMembership('dmId'),
      validateBody(dmMessageSchema),
    ],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const { id } = request.user!
      const { dmId } = request.params as { dmId: string }
      const { body, parentMessageId } = request.body as {
        body: string
        parentMessageId?: string
      }
      const message = await sendDmMessage(dmId, body, id, parentMessageId)
      return reply.status(201).send(message)
    },
  })

  // GET /api/messages/dm/:dmId — Get DM messages (paginated)
  app.get('/dm/:dmId', {
    schema: {
      summary: 'Get DM messages',
      description: 'Returns paginated messages for a DM conversation.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['dmId'],
        properties: {
          dmId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: paginationQuery,
      response: {
        200: paginatedMessagesResponse,
        422: errorResponse,
      },
    },
    preHandler: [authenticate, requireDmMembership('dmId')],
    handler: async (request, reply) => {
      const { dmId } = request.params as { dmId: string }
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await getDmMessages(dmId, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // GET /api/messages/:messageId — Get a single message
  app.get('/:messageId', {
    schema: {
      summary: 'Get message by ID',
      description: 'Returns a single message. User must have access to the message channel or DM.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: messageResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { messageId } = request.params as { messageId: string }
      await assertMessageAccess(messageId, request.user!.id)
      const message = await getMessageById(messageId)
      return reply.status(200).send(message)
    },
  })

  // PATCH /api/messages/:messageId — Edit a message
  app.patch('/:messageId', {
    schema: {
      summary: 'Edit message',
      description: 'Edits the body of a message. Author or Admin+ can edit.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 40000 },
        },
      },
      response: {
        200: messageResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    preHandler: [authenticate, validateBody(editMessageSchema)],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { messageId } = request.params as { messageId: string }
      const { body } = request.body as { body: string }
      const updated = await editMessage(messageId, body, id, orgRole)
      return reply.status(200).send(updated)
    },
  })

  // DELETE /api/messages/:messageId — Delete a message
  app.delete('/:messageId', {
    schema: {
      summary: 'Delete message',
      description: 'Soft-deletes a message. Author or Admin+ can delete.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
        403: errorResponse,
        404: errorResponse,
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { messageId } = request.params as { messageId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const result = await deleteMessage(messageId, id, orgRole, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // --- Thread replies ---

  // GET /api/messages/:messageId/thread — Get thread replies
  app.get('/:messageId/thread', {
    schema: {
      summary: 'Get thread replies',
      description: 'Returns paginated thread replies for a parent message.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: paginationQuery,
      response: {
        200: paginatedMessagesResponse,
        422: errorResponse,
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { messageId } = request.params as { messageId: string }
      await assertMessageAccess(messageId, request.user!.id)
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await getThreadReplies(messageId, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // POST /api/messages/:messageId/thread — Reply in a thread
  app.post('/:messageId/thread', {
    schema: {
      summary: 'Reply in thread',
      description: 'Sends a reply in a message thread.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', format: 'uuid', description: 'Parent message ID' },
        },
      },
      body: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', minLength: 1, maxLength: 40000 },
        },
      },
      response: {
        201: messageResponse,
        403: errorResponse,
        404: errorResponse,
      },
    },
    preHandler: [authenticate, validateBody(threadReplySchema)],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
    handler: async (request, reply) => {
      const { id } = request.user!
      const { messageId } = request.params as { messageId: string }
      await assertMessageAccess(messageId, id)
      const { body } = request.body as { body: string }

      // Look up the parent to determine where the reply belongs
      const parent = await getMessageById(messageId)

      let message
      if (parent.channelId) {
        message = await sendChannelMessage(parent.channelId, body, id, messageId)
      } else if (parent.dmId) {
        message = await sendDmMessage(parent.dmId, body, id, messageId)
      } else {
        throw new Error('Parent message has no channel or DM association')
      }

      return reply.status(201).send(message)
    },
  })

  // --- Edit history ---

  // GET /api/messages/:messageId/versions — Get edit history
  app.get('/:messageId/versions', {
    schema: {
      summary: 'Get message edit history',
      description: 'Returns the version history for an edited message.',
      tags: ['Messages'],
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
              body: { type: 'string' },
              editedAt: { type: 'string', format: 'date-time' },
              editedBy: { type: 'string', format: 'uuid' },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { messageId } = request.params as { messageId: string }
      await assertMessageAccess(messageId, id)
      const versions = await getMessageVersions(messageId, id, orgRole)
      return reply.status(200).send(versions)
    },
  })

  // --- Link previews ---

  // GET /api/messages/:messageId/previews — Get link previews for a message
  app.get('/:messageId/previews', {
    schema: {
      summary: 'Get link previews',
      description: 'Returns link preview metadata for URLs found in the message body.',
      tags: ['Messages'],
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            previews: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  title: { type: 'string' },
                  description: { type: 'string' },
                  image: { type: 'string' },
                  siteName: { type: 'string' },
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
      const { messageId } = request.params as { messageId: string }
      await assertMessageAccess(messageId, id)
      const previews = await getLinkPreviews(messageId)
      return reply.status(200).send({ previews })
    },
  })
}
