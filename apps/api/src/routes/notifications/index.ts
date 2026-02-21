/**
 * Notification routes — device token management and preferences.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, users } from '@smoker/db'
import { authenticate } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import {
  registerDevice,
  unregisterDevice,
} from '../../services/notification.service.js'
import { getRedis } from '../../lib/redis.js'
import { logger } from '../../lib/logger.js'

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

      // Try Redis cache first
      const raw = await redis.get(`${NOTIF_PREFS_KEY_PREFIX}${id}`)
      if (raw) {
        try {
          const stored = JSON.parse(raw)
          return reply.status(200).send({ ...DEFAULT_PREFS, ...stored })
        } catch {
          logger.warn({ userId: id }, 'Failed to parse cached notification prefs, falling back to DB')
        }
      }

      // Fall back to database
      const [user] = await db
        .select({ notificationPreferences: users.notificationPreferences })
        .from(users)
        .where(eq(users.id, id))
        .limit(1)

      if (!user || !user.notificationPreferences) {
        return reply.status(200).send(DEFAULT_PREFS)
      }

      let dbPrefs: Record<string, unknown> = {}
      try {
        dbPrefs = typeof user.notificationPreferences === 'string'
          ? JSON.parse(user.notificationPreferences)
          : user.notificationPreferences as Record<string, unknown>
      } catch {
        logger.warn({ userId: id }, 'Failed to parse DB notification prefs, using defaults')
        return reply.status(200).send(DEFAULT_PREFS)
      }

      const merged = { ...DEFAULT_PREFS, ...dbPrefs }

      // Populate Redis cache (expire after 1 hour)
      await redis.set(
        `${NOTIF_PREFS_KEY_PREFIX}${id}`,
        JSON.stringify(merged),
        'EX',
        3600,
      )

      return reply.status(200).send(merged)
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

      // Merge with existing prefs from Redis cache or DB
      let existing: Record<string, unknown> = {}
      const raw = await redis.get(`${NOTIF_PREFS_KEY_PREFIX}${id}`)
      if (raw) {
        try {
          existing = JSON.parse(raw)
        } catch {
          logger.warn({ userId: id }, 'Failed to parse cached notification prefs on PUT')
        }
      }

      // If cache was empty, try DB
      if (!raw) {
        const [user] = await db
          .select({ notificationPreferences: users.notificationPreferences })
          .from(users)
          .where(eq(users.id, id))
          .limit(1)

        if (user?.notificationPreferences) {
          try {
            existing = typeof user.notificationPreferences === 'string'
              ? JSON.parse(user.notificationPreferences)
              : user.notificationPreferences as Record<string, unknown>
          } catch {
            logger.warn({ userId: id }, 'Failed to parse DB notification prefs on PUT')
          }
        }
      }

      const merged = { ...DEFAULT_PREFS, ...existing, ...body }

      // Persist to database
      await db
        .update(users)
        .set({
          notificationPreferences: merged,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))

      // Update Redis cache (expire after 1 hour)
      await redis.set(
        `${NOTIF_PREFS_KEY_PREFIX}${id}`,
        JSON.stringify(merged),
        'EX',
        3600,
      )

      return reply.status(200).send(merged)
    },
  })
}
