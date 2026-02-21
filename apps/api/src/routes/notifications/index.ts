/**
 * Notification routes — device token management and preferences.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import {
  registerDevice,
  unregisterDevice,
} from '../../services/notification.service.js'
import { getRedis } from '../../lib/redis.js'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const registerDeviceSchema = z.object({
  token: z.string().min(1).max(500),
  platform: z.enum(['ios', 'android', 'web']),
})

const unregisterDeviceSchema = z.object({
  token: z.string().min(1).max(500),
})

const notificationPrefsSchema = z.object({
  announcements: z.boolean().optional(),
  shifts: z.boolean().optional(),
  dms: z.boolean().optional(),
  channelMessages: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().nullable().optional(),
  quietHoursEnd: z.string().nullable().optional(),
})

const NOTIF_PREFS_KEY_PREFIX = 'notif:prefs:'

const DEFAULT_PREFS = {
  announcements: true,
  shifts: true,
  dms: true,
  channelMessages: true,
  quietHoursEnabled: false,
  quietHoursStart: null as string | null,
  quietHoursEnd: null as string | null,
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/notifications/register — Register device for push notifications
  app.post('/register', {
    schema: {
      summary: 'Register device',
      description: 'Registers a device token for push notifications.',
      tags: ['Notifications'],
      body: {
        type: 'object',
        required: ['token', 'platform'],
        properties: {
          token: { type: 'string', minLength: 1, maxLength: 500, description: 'Push notification device token' },
          platform: { type: 'string', enum: ['ios', 'android', 'web'], description: 'Device platform' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
    preHandler: [authenticate, validateBody(registerDeviceSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { token, platform } = request.body as {
        token: string
        platform: string
      }
      const result = await registerDevice(id, token, platform)
      return reply.status(200).send(result)
    },
  })

  // DELETE /api/notifications/unregister — Unregister device
  app.delete('/unregister', {
    schema: {
      summary: 'Unregister device',
      description: 'Removes a device token from push notification registration.',
      tags: ['Notifications'],
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
    preHandler: [authenticate, validateBody(unregisterDeviceSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { token } = request.body as { token: string }
      const result = await unregisterDevice(id, token)
      return reply.status(200).send(result)
    },
  })

  // GET /api/notifications/preferences — Get notification preferences
  app.get('/preferences', {
    schema: {
      summary: 'Get notification preferences',
      description: 'Returns the current user\'s notification preferences.',
      tags: ['Notifications'],
      response: {
        200: {
          type: 'object',
          properties: {
            announcements: { type: 'boolean' },
            shifts: { type: 'boolean' },
            dms: { type: 'boolean' },
            channelMessages: { type: 'boolean' },
            quietHoursEnabled: { type: 'boolean' },
            quietHoursStart: { type: 'string', nullable: true },
            quietHoursEnd: { type: 'string', nullable: true },
          },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const redis = getRedis()
      const raw = await redis.get(`${NOTIF_PREFS_KEY_PREFIX}${id}`)

      if (!raw) {
        return reply.status(200).send(DEFAULT_PREFS)
      }

      const stored = JSON.parse(raw)
      return reply.status(200).send({ ...DEFAULT_PREFS, ...stored })
    },
  })

  // PUT /api/notifications/preferences — Update notification preferences
  app.put('/preferences', {
    schema: {
      summary: 'Update notification preferences',
      description: 'Updates the current user\'s notification preferences. Only provided fields are changed.',
      tags: ['Notifications'],
      body: {
        type: 'object',
        properties: {
          announcements: { type: 'boolean' },
          shifts: { type: 'boolean' },
          dms: { type: 'boolean' },
          channelMessages: { type: 'boolean' },
          quietHoursEnabled: { type: 'boolean' },
          quietHoursStart: { type: 'string', nullable: true },
          quietHoursEnd: { type: 'string', nullable: true },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            announcements: { type: 'boolean' },
            shifts: { type: 'boolean' },
            dms: { type: 'boolean' },
            channelMessages: { type: 'boolean' },
            quietHoursEnabled: { type: 'boolean' },
            quietHoursStart: { type: 'string', nullable: true },
            quietHoursEnd: { type: 'string', nullable: true },
          },
        },
      },
    },
    preHandler: [authenticate, validateBody(notificationPrefsSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const body = request.body as z.infer<typeof notificationPrefsSchema>
      const redis = getRedis()

      // Merge with existing prefs
      const raw = await redis.get(`${NOTIF_PREFS_KEY_PREFIX}${id}`)
      const existing = raw ? JSON.parse(raw) : {}
      const merged = { ...DEFAULT_PREFS, ...existing, ...body }

      await redis.set(`${NOTIF_PREFS_KEY_PREFIX}${id}`, JSON.stringify(merged))

      return reply.status(200).send(merged)
    },
  })
}
