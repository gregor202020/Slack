/**
 * Channel routes — CRUD, membership, settings, archiving.
 *
 * Spec references: Sections 7.1-7.3, 5.4
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireRole, requireChannelMembership } from '../../middleware/roles.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import { createChannelSchema, updateChannelSchema, paginationQuerySchema } from '@smoker/shared'
import {
  listChannels,
  createChannel,
  getChannelById,
  updateChannel,
  archiveChannel,
  unarchiveChannel,
  deleteChannel,
  listChannelMembers,
  addChannelMembers,
  removeChannelMember,
  leaveChannel,
  joinChannel,
  updateNotificationPref,
  updateChannelSettings,
} from '../../services/channel.service.js'
import {
  pinMessage,
  unpinMessage,
  listPinnedMessages,
} from '../../services/pin.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas
// ---------------------------------------------------------------------------

const channelListQuerySchema = paginationQuerySchema.extend({
  scope: z.enum(['org', 'venue']).optional(),
  venueId: z.string().uuid('Invalid venue ID').optional(),
})

const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(50),
})

const notificationPrefSchema = z.object({
  pref: z.enum(['all', 'mentions', 'muted']),
})

const channelSettingsSchema = z.object({
  isDefault: z.boolean().optional(),
  isMandatory: z.boolean().optional(),
})

const pinMessageSchema = z.object({
  messageId: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// Shared schema fragments
// ---------------------------------------------------------------------------

const channelIdParam = {
  type: 'object' as const,
  required: ['channelId'],
  properties: {
    channelId: { type: 'string' as const, format: 'uuid', description: 'Channel ID' },
  },
}

const successResponse = {
  type: 'object' as const,
  properties: {
    success: { type: 'boolean' as const },
  },
}

const paginationQuery = {
  type: 'object' as const,
  properties: {
    cursor: { type: 'string' as const, description: 'Cursor for pagination' },
    limit: { type: 'integer' as const, minimum: 1, maximum: 100, default: 25, description: 'Number of items to return' },
  },
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/channels — List channels (browseable)
  app.get('/', {
    schema: {
      summary: 'List channels',
      description: 'Returns a paginated list of channels the user can browse. Filterable by scope and venue.',
      tags: ['Channels'],
      querystring: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['org', 'venue'], description: 'Filter by channel scope' },
          venueId: { type: 'string', format: 'uuid', description: 'Filter by venue ID' },
          cursor: { type: 'string', description: 'Cursor for pagination' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            channels: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  type: { type: 'string' },
                  scope: { type: 'string' },
                  topic: { type: 'string' },
                  memberCount: { type: 'integer' },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            nextCursor: { type: 'string', nullable: true },
          },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const parsed = channelListQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { scope, venueId, cursor, limit } = parsed.data
      const result = await listChannels(id, orgRole, {
        scope,
        venueId,
        cursor,
        limit,
      })
      return reply.status(200).send(result)
    },
  })

  // POST /api/channels — Create a channel
  // Any user can create (spec Section 7.1)
  // Rate limit: 10 per hour per user
  app.post('/', {
    schema: {
      summary: 'Create a channel',
      description: 'Creates a new channel. Any authenticated user can create channels.',
      tags: ['Channels'],
      body: {
        type: 'object',
        required: ['name', 'type', 'scope'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80, description: 'Channel name' },
          type: { type: 'string', enum: ['public', 'private'], description: 'Channel visibility type' },
          scope: { type: 'string', enum: ['org', 'venue'], description: 'Channel scope' },
          venueId: { type: 'string', format: 'uuid', description: 'Venue ID (required when scope is venue)' },
          topic: { type: 'string', maxLength: 250, description: 'Channel topic' },
          description: { type: 'string', maxLength: 1000, description: 'Channel description' },
        },
      },
      response: {
        201: {
          type: 'object',
          description: 'Channel created',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            type: { type: 'string' },
            scope: { type: 'string' },
            topic: { type: 'string' },
            description: { type: 'string' },
            createdBy: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    preHandler: [authenticate, validateBody(createChannelSchema)],
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 hour',
      },
    },
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as {
        name: string
        type: string
        scope: string
        venueId?: string
        topic?: string
        description?: string
      }
      const channel = await createChannel(body, id, ipAddress, userAgent)
      return reply.status(201).send(channel)
    },
  })

  // GET /api/channels/:channelId — Get channel details
  app.get('/:channelId', {
    schema: {
      summary: 'Get channel details',
      description: 'Returns full details for a specific channel. Requires channel membership.',
      tags: ['Channels'],
      params: channelIdParam,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            type: { type: 'string' },
            scope: { type: 'string' },
            topic: { type: 'string' },
            description: { type: 'string' },
            isArchived: { type: 'boolean' },
            createdBy: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            memberCount: { type: 'integer' },
          },
        },
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }
      const channel = await getChannelById(channelId)
      return reply.status(200).send(channel)
    },
  })

  // PATCH /api/channels/:channelId — Update channel settings
  // Channel owner, or Admin+ (spec Section 5.4)
  app.patch('/:channelId', {
    schema: {
      summary: 'Update channel',
      description: 'Updates channel name, topic, or description. Requires channel ownership or Admin+ role.',
      tags: ['Channels'],
      params: channelIdParam,
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          topic: { type: 'string', maxLength: 250 },
          description: { type: 'string', maxLength: 1000 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            topic: { type: 'string' },
            description: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId'), validateBody(updateChannelSchema)],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { channelId } = request.params as { channelId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as { name?: string; topic?: string; description?: string }
      const updated = await updateChannel(channelId, body, id, orgRole, ipAddress, userAgent)
      return reply.status(200).send(updated)
    },
  })

  // POST /api/channels/:channelId/archive — Archive a channel
  // Admin and Super admin only (spec Section 7.3)
  app.post('/:channelId/archive', {
    schema: {
      summary: 'Archive channel',
      description: 'Archives a channel, making it read-only. Admin or Super admin only.',
      tags: ['Channels'],
      params: channelIdParam,
      response: {
        200: successResponse,
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await archiveChannel(channelId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // POST /api/channels/:channelId/unarchive — Unarchive a channel
  app.post('/:channelId/unarchive', {
    schema: {
      summary: 'Unarchive channel',
      description: 'Restores an archived channel. Admin or Super admin only.',
      tags: ['Channels'],
      params: channelIdParam,
      response: {
        200: successResponse,
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await unarchiveChannel(channelId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // DELETE /api/channels/:channelId — Delete a channel
  // Admin and Super admin only (spec Section 5.4)
  app.delete('/:channelId', {
    schema: {
      summary: 'Delete channel',
      description: 'Permanently deletes a channel and its messages. Admin or Super admin only.',
      tags: ['Channels'],
      params: channelIdParam,
      response: {
        200: successResponse,
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await deleteChannel(channelId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // --- Channel membership ---

  // GET /api/channels/:channelId/members — List channel members
  app.get('/:channelId/members', {
    schema: {
      summary: 'List channel members',
      description: 'Returns a paginated list of members in the channel.',
      tags: ['Channels'],
      params: channelIdParam,
      querystring: paginationQuery,
      response: {
        200: {
          type: 'object',
          properties: {
            members: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string', format: 'uuid' },
                  fullName: { type: 'string' },
                  displayName: { type: 'string' },
                  orgRole: { type: 'string' },
                  joinedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            nextCursor: { type: 'string', nullable: true },
          },
        },
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await listChannelMembers(channelId, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // POST /api/channels/:channelId/members — Invite/add users to channel
  // Any channel member can invite (spec Section 7.1)
  app.post('/:channelId/members', {
    schema: {
      summary: 'Add members to channel',
      description: 'Adds one or more users to the channel. Any channel member can invite others.',
      tags: ['Channels'],
      params: channelIdParam,
      body: {
        type: 'object',
        required: ['userIds'],
        properties: {
          userIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            minItems: 1,
            maxItems: 50,
            description: 'User IDs to add',
          },
        },
      },
      response: {
        201: successResponse,
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId'), validateBody(addMembersSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { userIds } = request.body as { userIds: string[] }
      await addChannelMembers(channelId, userIds, id, ipAddress, userAgent)
      return reply.status(201).send({ success: true })
    },
  })

  // DELETE /api/channels/:channelId/members/:userId — Remove user from channel
  app.delete('/:channelId/members/:userId', {
    schema: {
      summary: 'Remove member from channel',
      description: 'Removes a user from the channel.',
      tags: ['Channels'],
      params: {
        type: 'object',
        required: ['channelId', 'userId'],
        properties: {
          channelId: { type: 'string', format: 'uuid', description: 'Channel ID' },
          userId: { type: 'string', format: 'uuid', description: 'User ID to remove' },
        },
      },
      response: {
        200: successResponse,
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId, userId } = request.params as { channelId: string; userId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await removeChannelMember(channelId, userId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // POST /api/channels/:channelId/leave — Leave a channel
  app.post('/:channelId/leave', {
    schema: {
      summary: 'Leave channel',
      description: 'Removes the current user from the channel.',
      tags: ['Channels'],
      params: channelIdParam,
      response: {
        200: successResponse,
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      await leaveChannel(channelId, id)
      return reply.status(200).send({ success: true })
    },
  })

  // POST /api/channels/:channelId/join — Join a public channel
  app.post('/:channelId/join', {
    schema: {
      summary: 'Join channel',
      description: 'Joins a public channel. Does not require existing membership.',
      tags: ['Channels'],
      params: channelIdParam,
      response: {
        200: successResponse,
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      await joinChannel(channelId, id)
      return reply.status(200).send({ success: true })
    },
  })

  // --- Channel notification preferences ---

  // PATCH /api/channels/:channelId/notification-pref — Update notification preference
  app.patch('/:channelId/notification-pref', {
    schema: {
      summary: 'Update notification preference',
      description: 'Sets the notification preference for the current user in this channel.',
      tags: ['Channels'],
      params: channelIdParam,
      body: {
        type: 'object',
        required: ['pref'],
        properties: {
          pref: { type: 'string', enum: ['all', 'mentions', 'muted'], description: 'Notification preference level' },
        },
      },
      response: {
        200: successResponse,
      },
    },
    preHandler: [
      authenticate,
      requireChannelMembership('channelId'),
      validateBody(notificationPrefSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      const { pref } = request.body as { pref: string }
      await updateNotificationPref(channelId, id, pref)
      return reply.status(200).send({ success: true })
    },
  })

  // --- Channel default/mandatory settings (Admin) ---

  // PATCH /api/channels/:channelId/settings — Update default/mandatory settings
  app.patch('/:channelId/settings', {
    schema: {
      summary: 'Update channel admin settings',
      description: 'Updates whether the channel is default and/or mandatory. Admin or Super admin only.',
      tags: ['Channels'],
      params: channelIdParam,
      body: {
        type: 'object',
        properties: {
          isDefault: { type: 'boolean', description: 'Whether new users auto-join this channel' },
          isMandatory: { type: 'boolean', description: 'Whether users cannot leave this channel' },
        },
      },
      response: {
        200: successResponse,
      },
    },
    preHandler: [
      authenticate,
      requireRole('admin', 'super_admin'),
      validateBody(channelSettingsSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as { isDefault?: boolean; isMandatory?: boolean }
      await updateChannelSettings(channelId, body, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // --- Pin messages ---

  // POST /api/channels/:channelId/pins — Pin a message
  app.post('/:channelId/pins', {
    schema: {
      summary: 'Pin a message',
      description: 'Pins a message in the channel. Requires channel membership.',
      tags: ['Channels'],
      params: channelIdParam,
      body: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', format: 'uuid', description: 'Message ID to pin' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            messageId: { type: 'string', format: 'uuid' },
            channelId: { type: 'string', format: 'uuid' },
            pinnedBy: { type: 'string', format: 'uuid' },
            pinnedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId'), validateBody(pinMessageSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId } = request.params as { channelId: string }
      const { messageId } = request.body as { messageId: string }
      const pin = await pinMessage(channelId, messageId, id)
      return reply.status(201).send(pin)
    },
  })

  // DELETE /api/channels/:channelId/pins/:messageId — Unpin a message
  app.delete('/:channelId/pins/:messageId', {
    schema: {
      summary: 'Unpin a message',
      description: 'Removes a pinned message from the channel.',
      tags: ['Channels'],
      params: {
        type: 'object',
        required: ['channelId', 'messageId'],
        properties: {
          channelId: { type: 'string', format: 'uuid' },
          messageId: { type: 'string', format: 'uuid', description: 'Message ID to unpin' },
        },
      },
      response: {
        200: successResponse,
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { channelId, messageId } = request.params as { channelId: string; messageId: string }
      const result = await unpinMessage(channelId, messageId, id)
      return reply.status(200).send(result)
    },
  })

  // GET /api/channels/:channelId/pins — List pinned messages
  app.get('/:channelId/pins', {
    schema: {
      summary: 'List pinned messages',
      description: 'Returns all pinned messages in the channel.',
      tags: ['Channels'],
      params: channelIdParam,
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              messageId: { type: 'string', format: 'uuid' },
              pinnedBy: { type: 'string', format: 'uuid' },
              pinnedAt: { type: 'string', format: 'date-time' },
              message: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  body: { type: 'string' },
                  senderId: { type: 'string', format: 'uuid' },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }
      const pins = await listPinnedMessages(channelId)
      return reply.status(200).send(pins)
    },
  })
}
