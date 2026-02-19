/**
 * Maintenance request routes — CRUD, comments, status changes.
 *
 * Spec references: Section 15.1
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import { createMaintenanceSchema, createMaintenanceCommentSchema } from '@smoker/shared'
import {
  listMaintenanceRequests,
  createMaintenanceRequest,
  getMaintenanceRequest,
  updateMaintenanceRequest,
  changeMaintenanceStatus,
  listComments,
  addComment,
  deleteComment,
  listVenueMaintenanceRequests,
} from '../../services/maintenance.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas
// ---------------------------------------------------------------------------

const updateMaintenanceSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().min(1).max(10000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
})

const changeStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done']),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function maintenanceRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/maintenance — List maintenance requests
  app.get('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as {
        venueId?: string
        status?: string
        priority?: string
        cursor?: string
        limit?: string
      }
      const result = await listMaintenanceRequests({
        venueId: query.venueId,
        status: query.status,
        priority: query.priority,
        cursor: query.cursor,
        limit: query.limit ? Number(query.limit) : undefined,
      })
      return reply.status(200).send(result)
    },
  })

  // POST /api/maintenance — Create a maintenance request
  // Any user can create for a venue they belong to (spec Section 15.1)
  app.post('/', {
    preHandler: [authenticate, validateBody(createMaintenanceSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as {
        venueId: string
        title: string
        description: string
        priority: string
      }
      const result = await createMaintenanceRequest(body, id, ipAddress, userAgent)
      return reply.status(201).send(result)
    },
  })

  // GET /api/maintenance/:requestId — Get maintenance request details
  app.get('/:requestId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { requestId } = request.params as { requestId: string }
      const result = await getMaintenanceRequest(requestId)
      return reply.status(200).send(result)
    },
  })

  // PATCH /api/maintenance/:requestId — Update maintenance request
  app.patch('/:requestId', {
    preHandler: [authenticate, validateBody(updateMaintenanceSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { requestId } = request.params as { requestId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as {
        title?: string
        description?: string
        priority?: string
      }
      const result = await updateMaintenanceRequest(requestId, body, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // PATCH /api/maintenance/:requestId/status — Change status
  // Anyone can pick up a request and change status (spec Section 15.1)
  // Admin/Super admin can change status of any request
  app.patch('/:requestId/status', {
    preHandler: [authenticate, validateBody(changeStatusSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { requestId } = request.params as { requestId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { status } = request.body as { status: string }
      const result = await changeMaintenanceStatus(requestId, status, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // --- Comments on maintenance requests ---

  // GET /api/maintenance/:requestId/comments — List comments
  app.get('/:requestId/comments', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { requestId } = request.params as { requestId: string }
      const query = request.query as { cursor?: string; limit?: string }
      const result = await listComments(
        requestId,
        query.cursor,
        query.limit ? Number(query.limit) : undefined,
      )
      return reply.status(200).send(result)
    },
  })

  // POST /api/maintenance/:requestId/comments — Add a comment
  app.post('/:requestId/comments', {
    preHandler: [authenticate, validateBody(createMaintenanceCommentSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { requestId } = request.params as { requestId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { body } = request.body as { body: string }
      const result = await addComment(requestId, body, id, ipAddress, userAgent)
      return reply.status(201).send(result)
    },
  })

  // DELETE /api/maintenance/:requestId/comments/:commentId — Delete a comment
  app.delete('/:requestId/comments/:commentId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { commentId } = request.params as { requestId: string; commentId: string }
      await deleteComment(commentId, id, orgRole)
      return reply.status(200).send({ success: true })
    },
  })

  // GET /api/maintenance/venue/:venueId — List requests for a specific venue
  app.get('/venue/:venueId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { venueId } = request.params as { venueId: string }
      const query = request.query as {
        status?: string
        priority?: string
        cursor?: string
        limit?: string
      }
      const result = await listVenueMaintenanceRequests(venueId, {
        status: query.status,
        priority: query.priority,
        cursor: query.cursor,
        limit: query.limit ? Number(query.limit) : undefined,
      })
      return reply.status(200).send(result)
    },
  })
}
