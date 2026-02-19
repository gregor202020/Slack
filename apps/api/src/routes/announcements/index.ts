/**
 * Announcement routes — Create, acknowledge, manage, and dashboard.
 *
 * Spec references: Section 12
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/roles.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import {
  listAnnouncements,
  createAnnouncement,
  getAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  acknowledgeAnnouncement,
  getAckDashboard,
  getPendingAnnouncements,
  escalateAnnouncement,
} from '../../services/announcement.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas
// ---------------------------------------------------------------------------

const createAnnouncementSchema = z.object({
  scope: z.enum(['system', 'venue', 'channel']),
  venueId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(40_000),
  ackRequired: z.boolean(),
})

const updateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(40_000).optional(),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function announcementRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/announcements/pending — Get pending announcements requiring acknowledgement
  // NOTE: Must be registered BEFORE /:announcementId to avoid param capture
  app.get('/pending', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const result = await getPendingAnnouncements(id)
      return reply.status(200).send(result)
    },
  })

  // GET /api/announcements — List announcements relevant to the user
  app.get('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const query = request.query as {
        scope?: string
        venueId?: string
        cursor?: string
        limit?: string
      }
      const result = await listAnnouncements(id, orgRole, {
        scope: query.scope,
        venueId: query.venueId,
        cursor: query.cursor,
        limit: query.limit ? Number(query.limit) : undefined,
      })
      return reply.status(200).send(result)
    },
  })

  // POST /api/announcements — Create an announcement
  // Mid, Admin, and Super admin can create (spec Section 12.2)
  app.post('/', {
    preHandler: [
      authenticate,
      requireRole('mid', 'admin', 'super_admin'),
      validateBody(createAnnouncementSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as z.infer<typeof createAnnouncementSchema>
      const announcement = await createAnnouncement(body, id, ipAddress, userAgent)
      return reply.status(201).send(announcement)
    },
  })

  // GET /api/announcements/:announcementId — Get announcement details
  app.get('/:announcementId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { announcementId } = request.params as { announcementId: string }
      const result = await getAnnouncement(announcementId, id)
      return reply.status(200).send(result)
    },
  })

  // PATCH /api/announcements/:announcementId — Edit an announcement
  app.patch('/:announcementId', {
    preHandler: [authenticate, validateBody(updateAnnouncementSchema)],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { announcementId } = request.params as { announcementId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as z.infer<typeof updateAnnouncementSchema>
      const updated = await updateAnnouncement(
        announcementId,
        body,
        id,
        orgRole,
        ipAddress,
        userAgent,
      )
      return reply.status(200).send(updated)
    },
  })

  // DELETE /api/announcements/:announcementId — Delete an announcement
  // Must be deleted individually (spec Section 12.12)
  app.delete('/:announcementId', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { announcementId } = request.params as { announcementId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const result = await deleteAnnouncement(announcementId, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // POST /api/announcements/:announcementId/acknowledge — Acknowledge an announcement
  app.post('/:announcementId/acknowledge', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, sessionId } = request.user!
      const { announcementId } = request.params as { announcementId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const result = await acknowledgeAnnouncement(
        announcementId,
        id,
        sessionId,
        ipAddress,
        userAgent,
      )
      return reply.status(200).send(result)
    },
  })

  // GET /api/announcements/:announcementId/acks — Get acknowledgement status
  // Available to: announcement owner, Admin, Super admin (spec Section 12.10)
  app.get('/:announcementId/acks', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { announcementId } = request.params as { announcementId: string }
      const result = await getAckDashboard(announcementId)
      return reply.status(200).send(result)
    },
  })

  // POST /api/announcements/:announcementId/escalate — Trigger additional escalation push
  // Admin and Super admin (spec Section 12.10)
  app.post('/:announcementId/escalate', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { announcementId } = request.params as { announcementId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const result = await escalateAnnouncement(announcementId, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // GET /api/announcements/:announcementId/export — Export acknowledgement data to CSV
  // Admin and Super admin (spec Section 12.10)
  app.get('/:announcementId/export', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (_request, reply) => {
      // TODO: Implement CSV export of acknowledgement data
      return reply.status(501).send({
        error: 'NOT_IMPLEMENTED',
        message: 'CSV export is not yet implemented.',
      })
    },
  })
}
