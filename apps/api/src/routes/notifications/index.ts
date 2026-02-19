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

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/notifications/register — Register device for push notifications
  app.post('/register', {
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
    preHandler: [authenticate, validateBody(unregisterDeviceSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { token } = request.body as { token: string }
      const result = await unregisterDevice(id, token)
      return reply.status(200).send(result)
    },
  })

  // GET /api/notifications/preferences — Get notification preferences (placeholder)
  app.get('/preferences', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      // Placeholder — return default preferences until preferences table is built
      return reply.status(200).send({
        announcements: true,
        shifts: true,
        dms: true,
        channelMessages: true,
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
      })
    },
  })

  // PUT /api/notifications/preferences — Update notification preferences (placeholder)
  app.put('/preferences', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      // Placeholder — accept and acknowledge but don't persist yet
      return reply.status(200).send({ success: true })
    },
  })
}
