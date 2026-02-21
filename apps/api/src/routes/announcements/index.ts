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
// Shared schema fragments
// ---------------------------------------------------------------------------

const announcementIdParam = {
  type: 'object' as const,
  required: ['announcementId'],
  properties: {
    announcementId: { type: 'string' as const, format: 'uuid' },
  },
}

const successResponse = {
  type: 'object' as const,
  properties: {
    success: { type: 'boolean' as const },
  },
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function announcementRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/announcements/pending — Get pending announcements requiring acknowledgement
  // NOTE: Must be registered BEFORE /:announcementId to avoid param capture
  app.get('/pending', {
    schema: {
      summary: 'Get pending announcements',
      description: 'Returns announcements requiring acknowledgement from the current user.',
      tags: ['Announcements'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              title: { type: 'string' },
              body: { type: 'string' },
              scope: { type: 'string' },
              ackRequired: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const result = await getPendingAnnouncements(id)
      return reply.status(200).send(result)
    },
  })

  // GET /api/announcements — List announcements relevant to the user
  app.get('/', {
    schema: {
      summary: 'List announcements',
      description: 'Returns announcements visible to the current user, filterable by scope and venue.',
      tags: ['Announcements'],
      querystring: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['system', 'venue', 'channel'] },
          venueId: { type: 'string', format: 'uuid' },
          cursor: { type: 'string' },
          limit: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                  scope: { type: 'string' },
                  ackRequired: { type: 'boolean' },
                  createdBy: { type: 'string', format: 'uuid' },
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
    schema: {
      summary: 'Create announcement',
      description: 'Creates a new announcement. Mid, Admin, or Super admin role required.',
      tags: ['Announcements'],
      body: {
        type: 'object',
        required: ['scope', 'title', 'body', 'ackRequired'],
        properties: {
          scope: { type: 'string', enum: ['system', 'venue', 'channel'] },
          venueId: { type: 'string', format: 'uuid' },
          channelId: { type: 'string', format: 'uuid' },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          body: { type: 'string', minLength: 1, maxLength: 40000 },
          ackRequired: { type: 'boolean', description: 'Whether users must acknowledge this announcement' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            scope: { type: 'string' },
            ackRequired: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
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
    schema: {
      summary: 'Get announcement',
      description: 'Returns full details for a specific announcement.',
      tags: ['Announcements'],
      params: announcementIdParam,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            body: { type: 'string' },
            scope: { type: 'string' },
            ackRequired: { type: 'boolean' },
            createdBy: { type: 'string', format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
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
    schema: {
      summary: 'Update announcement',
      description: 'Updates an announcement title or body.',
      tags: ['Announcements'],
      params: announcementIdParam,
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          body: { type: 'string', minLength: 1, maxLength: 40000 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            body: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
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
  app.delete('/:announcementId', {
    schema: {
      summary: 'Delete announcement',
      description: 'Deletes an announcement. Admin or Super admin only.',
      tags: ['Announcements'],
      params: announcementIdParam,
      response: {
        200: successResponse,
      },
    },
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
    schema: {
      summary: 'Acknowledge announcement',
      description: 'Records the user\'s acknowledgement of an announcement.',
      tags: ['Announcements'],
      params: announcementIdParam,
      response: {
        200: successResponse,
      },
    },
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
  app.get('/:announcementId/acks', {
    schema: {
      summary: 'Get acknowledgement dashboard',
      description: 'Returns who has and has not acknowledged an announcement. Mid+ role required.',
      tags: ['Announcements'],
      params: announcementIdParam,
      response: {
        200: {
          type: 'object',
          properties: {
            totalUsers: { type: 'integer' },
            ackedCount: { type: 'integer' },
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string', format: 'uuid' },
                  fullName: { type: 'string' },
                  ackedAt: { type: 'string', format: 'date-time', nullable: true },
                },
              },
            },
          },
        },
      },
    },
    preHandler: [authenticate, requireRole('mid', 'admin', 'super_admin')],
    handler: async (request, reply) => {
      const { announcementId } = request.params as { announcementId: string }
      const result = await getAckDashboard(announcementId)
      return reply.status(200).send(result)
    },
  })

  // POST /api/announcements/:announcementId/escalate — Trigger additional escalation push
  app.post('/:announcementId/escalate', {
    schema: {
      summary: 'Escalate announcement',
      description: 'Sends an additional push notification to users who have not acknowledged. Admin or Super admin.',
      tags: ['Announcements'],
      params: announcementIdParam,
      response: {
        200: successResponse,
      },
    },
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
  app.get('/:announcementId/export', {
    schema: {
      summary: 'Export acknowledgements',
      description: 'Exports acknowledgement data as CSV. Admin or Super admin only.',
      tags: ['Announcements'],
      params: announcementIdParam,
      produces: ['text/csv'],
      response: {
        200: {
          type: 'string',
          description: 'CSV file with acknowledgement data',
        },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { announcementId } = request.params as { announcementId: string }
      const dashboard = await getAckDashboard(announcementId)

      const header = 'userId,userName,acknowledgedAt'
      const csvRows = dashboard.users.map(
        (u) =>
          `${u.userId},"${(u.fullName ?? '').replace(/"/g, '""')}",${u.ackedAt ? u.ackedAt.toISOString() : ''}`,
      )
      const csvData = [header, ...csvRows].join('\n')

      return reply
        .status(200)
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="acks-${announcementId}.csv"`)
        .send(csvData)
    },
  })
}
