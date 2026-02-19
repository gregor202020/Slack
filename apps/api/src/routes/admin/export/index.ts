/**
 * Admin data export routes.
 *
 * Spec references: Sections 16.5, 16.6
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requireReauth } from '../../../middleware/auth.js'
import { requireRole } from '../../../middleware/roles.js'
import { extractAuditContext } from '../../../lib/audit.js'
import {
  requestOrgExport,
  requestUserExport,
  getExportStatus,
  downloadExport,
  listExports,
} from '../../../services/admin.service.js'

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/admin/export/org — Full org data export
  // Super admin only, requires re-authentication (spec Section 16.6)
  app.post('/org', {
    preHandler: [authenticate, requireRole('super_admin'), requireReauth],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const result = await requestOrgExport(id, ipAddress, userAgent)
      return reply.status(202).send(result)
    },
  })

  // POST /api/admin/export/user/:userId — Per-user data export
  // Super admin only, requires re-authentication (spec Section 16.6)
  // Required for Australian Privacy Act Subject Access Requests
  app.post('/user/:userId', {
    preHandler: [authenticate, requireRole('super_admin'), requireReauth],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { userId } = request.params as { userId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const result = await requestUserExport(userId, id, ipAddress, userAgent)
      return reply.status(202).send(result)
    },
  })

  // GET /api/admin/export — List all exports
  // Must be registered before /:exportId to avoid route conflict
  app.get('/', {
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (_request, reply) => {
      const result = await listExports()
      return reply.status(200).send(result)
    },
  })

  // GET /api/admin/export/:exportId — Check export status
  app.get('/:exportId', {
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const { exportId } = request.params as { exportId: string }
      const result = await getExportStatus(exportId)
      return reply.status(200).send(result)
    },
  })

  // GET /api/admin/export/:exportId/download — Download export file
  app.get('/:exportId/download', {
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const { exportId } = request.params as { exportId: string }
      const result = await downloadExport(exportId)
      return reply.status(200).send(result)
    },
  })
}
