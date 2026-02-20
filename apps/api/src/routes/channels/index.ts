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
// Route registration
// ---------------------------------------------------------------------------

export async function channelRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/channels — List channels (browseable)
  app.get('/', {
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
    preHandler: [authenticate, requireChannelMembership('channelId')],
    handler: async (request, reply) => {
      const { channelId } = request.params as { channelId: string }
      const pins = await listPinnedMessages(channelId)
      return reply.status(200).send(pins)
    },
  })
}
