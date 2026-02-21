/**
 * Admin bulk delete routes.
 *
 * Spec references: Section 13
 */

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/auth.js'
import { requireRole } from '../../../middleware/roles.js'
import { validateBody } from '../../../middleware/validate.js'
import { extractAuditContext } from '../../../lib/audit.js'
import { bulkDeletePreviewSchema, bulkDeleteExecuteSchema } from '@smoker/shared'
import {
  previewBulkDelete,
  executeBulkDelete,
} from '../../../services/admin.service.js'

export async function bulkDeleteRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/admin/bulk-delete/preview — Preview bulk delete (get count)
  app.post('/preview', {
    schema: {
      summary: 'Preview bulk delete',
      description: 'Returns the count of messages that would be deleted. Admin or Super admin only.',
      tags: ['Admin'],
      body: {
        type: 'object',
        required: ['scope', 'olderThanDays'],
        properties: {
          scope: { type: 'string', enum: ['org', 'channel'] },
          channelId: { type: 'string', format: 'uuid', description: 'Required when scope is "channel"' },
          olderThanDays: { type: 'integer', minimum: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            count: { type: 'integer', description: 'Number of messages that would be deleted' },
          },
        },
      },
    },
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    preHandler: [
      authenticate,
      requireRole('admin', 'super_admin'),
      validateBody(bulkDeletePreviewSchema),
    ],
    handler: async (request, reply) => {
      const body = request.body as {
        scope: 'org' | 'channel'
        channelId?: string
        olderThanDays: number
      }
      const result = await previewBulkDelete(
        body.scope,
        body.channelId,
        body.olderThanDays,
      )
      return reply.status(200).send(result)
    },
  })

  // POST /api/admin/bulk-delete/execute — Execute bulk delete
  app.post('/execute', {
    schema: {
      summary: 'Execute bulk delete',
      description: 'Permanently deletes messages matching the criteria. Admin or Super admin only.',
      tags: ['Admin'],
      body: {
        type: 'object',
        required: ['scope', 'olderThanDays', 'confirmationText'],
        properties: {
          scope: { type: 'string', enum: ['org', 'channel'] },
          channelId: { type: 'string', format: 'uuid', description: 'Required when scope is "channel"' },
          olderThanDays: { type: 'integer', minimum: 1 },
          confirmationText: { type: 'string', description: 'Must match exact confirmation phrase' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            deletedCount: { type: 'integer' },
            success: { type: 'boolean' },
          },
        },
      },
    },
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
    preHandler: [
      authenticate,
      requireRole('admin', 'super_admin'),
      validateBody(bulkDeleteExecuteSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as {
        scope: 'org' | 'channel'
        channelId?: string
        olderThanDays: number
        confirmationText: string
      }
      const result = await executeBulkDelete(
        body.scope,
        body.channelId,
        body.olderThanDays,
        body.confirmationText,
        id,
        ipAddress,
        userAgent,
      )
      return reply.status(200).send(result)
    },
  })
}
