/**
 * Admin audit log routes.
 *
 * Spec references: Sections 16.3, 16.4
 */

import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../../middleware/auth.js'
import { requireRole } from '../../../middleware/roles.js'
import { extractAuditContext } from '../../../lib/audit.js'
import { logAudit } from '../../../lib/audit.js'
import {
  queryAuditLogs,
  getAuditLogById,
  verifyHashChain,
  exportAuditLogs,
} from '../../../services/admin.service.js'

export async function auditLogRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/audit-logs — Query audit logs
  // Admin and Super admin
  app.get('/', {
    schema: {
      summary: 'Query audit logs',
      description: 'Returns paginated audit log entries with optional filters. Admin or Super admin only.',
      tags: ['Admin'],
      querystring: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Filter by action type' },
          actorId: { type: 'string', format: 'uuid', description: 'Filter by actor user ID' },
          targetType: { type: 'string', description: 'Filter by target type' },
          targetId: { type: 'string', format: 'uuid', description: 'Filter by target ID' },
          startDate: { type: 'string', format: 'date-time', description: 'Start of date range' },
          endDate: { type: 'string', format: 'date-time', description: 'End of date range' },
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
                  actorId: { type: 'string', format: 'uuid' },
                  actorType: { type: 'string' },
                  action: { type: 'string' },
                  targetType: { type: 'string' },
                  targetId: { type: 'string', format: 'uuid', nullable: true },
                  metadata: { type: 'object', nullable: true },
                  ipAddress: { type: 'string', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            nextCursor: { type: 'string', nullable: true },
          },
        },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const query = request.query as {
        action?: string
        actorId?: string
        targetType?: string
        targetId?: string
        startDate?: string
        endDate?: string
        cursor?: string
        limit?: string
      }

      const result = await queryAuditLogs({
        action: query.action,
        actorId: query.actorId,
        targetType: query.targetType,
        targetId: query.targetId,
        startDate: query.startDate,
        endDate: query.endDate,
        cursor: query.cursor,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      })

      // Audit log access to audit logs
      await logAudit({
        actorId: id,
        actorType: 'user',
        action: 'audit_log.accessed',
        targetType: 'audit_logs',
        metadata: { filters: query },
        ipAddress,
        userAgent,
      })

      return reply.status(200).send(result)
    },
  })

  // GET /api/admin/audit-logs/verify — Verify audit log hash chain integrity
  // Super admin only — must be registered before /:logId
  app.get('/verify', {
    schema: {
      summary: 'Verify audit log integrity',
      description: 'Verifies the hash chain integrity of audit logs. Super admin only.',
      tags: ['Admin'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time', description: 'Start of date range to verify' },
          endDate: { type: 'string', format: 'date-time', description: 'End of date range to verify' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            totalChecked: { type: 'integer' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  logId: { type: 'string', format: 'uuid' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const query = request.query as {
        startDate?: string
        endDate?: string
      }
      const result = await verifyHashChain(query.startDate, query.endDate)
      return reply.status(200).send(result)
    },
  })

  // GET /api/admin/audit-logs/export — Export audit logs
  // Super admin only
  app.get('/export', {
    schema: {
      summary: 'Export audit logs',
      description: 'Exports audit logs as JSON or CSV. Super admin only.',
      tags: ['Admin'],
      querystring: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          actorId: { type: 'string', format: 'uuid' },
          targetType: { type: 'string' },
          targetId: { type: 'string', format: 'uuid' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          format: { type: 'string', enum: ['json', 'csv'], description: 'Export format (default: json)' },
        },
      },
      response: {
        200: {
          type: 'object',
          description: 'JSON export or CSV file download',
        },
      },
    },
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const query = request.query as {
        action?: string
        actorId?: string
        targetType?: string
        targetId?: string
        startDate?: string
        endDate?: string
        format?: string
      }

      const format = (query.format === 'csv' ? 'csv' : 'json') as 'json' | 'csv'
      const result = await exportAuditLogs(
        {
          action: query.action,
          actorId: query.actorId,
          targetType: query.targetType,
          targetId: query.targetId,
          startDate: query.startDate,
          endDate: query.endDate,
        },
        format,
      )

      // Audit log the export action
      await logAudit({
        actorId: id,
        actorType: 'user',
        action: 'audit_log.exported',
        targetType: 'audit_logs',
        metadata: { format, filters: query },
        ipAddress,
        userAgent,
      })

      if (format === 'csv') {
        return reply
          .status(200)
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
          .send(result.data)
      }

      return reply.status(200).send(result)
    },
  })

  // GET /api/admin/audit-logs/:logId — Get single audit log entry
  app.get('/:logId', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { logId } = request.params as { logId: string }
      const result = await getAuditLogById(logId)
      return reply.status(200).send(result)
    },
  })
}
