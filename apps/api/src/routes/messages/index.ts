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
import { sendMessageSchema, editMessageSchema } from '@smoker/shared'
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
// Route registration
// ---------------------------------------------------------------------------

export async function messageRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/messages/channel/:channelId — Get channel messages (paginated)
  app.get('/channel/:channelId', {
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }
      const { cursor, limit } = request.query as { cursor?: string; limit?: string }
      const result = await getChannelMessages(
        channelId,
        cursor,
        limit ? parseInt(limit, 10) : undefined,
      )
      return reply.status(200).send(result)
    },
  })

  // POST /api/messages/channel/:channelId — Send a message to a channel
  // Rate limit: 30 per minute per user (spec Section 8.10)
  app.post('/channel/:channelId', {
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
    preHandler: [authenticate, requireDmMembership('dmId')],
    handler: async (request, reply) => {
      const { dmId } = request.params as { dmId: string }
      const { cursor, limit } = request.query as { cursor?: string; limit?: string }
      const result = await getDmMessages(
        dmId,
        cursor,
        limit ? parseInt(limit, 10) : undefined,
      )
      return reply.status(200).send(result)
    },
  })

  // GET /api/messages/:messageId — Get a single message
  app.get('/:messageId', {
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
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { messageId } = request.params as { messageId: string }
      await assertMessageAccess(messageId, request.user!.id)
      const { cursor, limit } = request.query as { cursor?: string; limit?: string }
      const result = await getThreadReplies(
        messageId,
        cursor,
        limit ? parseInt(limit, 10) : undefined,
      )
      return reply.status(200).send(result)
    },
  })

  // POST /api/messages/:messageId/thread — Reply in a thread
  app.post('/:messageId/thread', {
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
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { messageId } = request.params as { messageId: string }
      await assertMessageAccess(messageId, id)
      const versions = await getMessageVersions(messageId, id, orgRole)
      return reply.status(200).send(versions)
    },
  })
}
