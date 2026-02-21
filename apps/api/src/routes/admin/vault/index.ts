/**
 * Admin vault routes — Deleted content management.
 *
 * Spec references: Section 16.7
 */

import type { FastifyInstance } from 'fastify'
import { authenticate, requireReauth } from '../../../middleware/auth.js'
import { requireRole } from '../../../middleware/roles.js'
import { extractAuditContext, logAudit } from '../../../lib/audit.js'
import {
  searchVault,
  getVaultItem,
  requestEarlyPurge,
  cancelPurge,
  listPendingPurges,
} from '../../../services/admin.service.js'

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/admin/vault — Search vault (deleted content)
  // Super admin only, access is audit logged (spec Section 16.7)
  app.get('/', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const query = request.query as {
        originalType?: string
        search?: string
        cursor?: string
        limit?: string
      }

      const result = await searchVault({
        originalType: query.originalType,
        search: query.search,
        cursor: query.cursor,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      })

      // Audit log every vault access
      await logAudit({
        actorId: id,
        actorType: 'user',
        action: 'vault.accessed',
        targetType: 'vault',
        metadata: { filters: query },
        ipAddress,
        userAgent,
      })

      return reply.status(200).send(result)
    },
  })

  // GET /api/admin/vault/purges — List pending purge requests
  // Must be registered before /:vaultId to avoid route conflict
  app.get('/purges', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (_request, reply) => {
      const result = await listPendingPurges()
      return reply.status(200).send(result)
    },
  })

  // POST /api/admin/vault/export — Export vault content
  // Super admin only, audit logged
  app.post('/export', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    preHandler: [authenticate, requireRole('super_admin'), requireReauth],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as {
        startDate?: string
        endDate?: string
      } | null

      const result = await searchVault({
        search: undefined,
        originalType: undefined,
        limit: 10_000,
      })

      // Filter by date range if provided
      let items = result.items
      if (body?.startDate) {
        const start = new Date(body.startDate)
        items = items.filter((item) => item.deletedAt >= start)
      }
      if (body?.endDate) {
        const end = new Date(body.endDate)
        items = items.filter((item) => item.deletedAt <= end)
      }

      // Fetch full content for each item
      const fullItems = await Promise.all(
        items.map((item) => getVaultItem(item.id)),
      )

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        exportedBy: id,
        itemCount: fullItems.length,
        items: fullItems,
      }

      await logAudit({
        actorId: id,
        actorType: 'user',
        action: 'vault.exported',
        targetType: 'vault',
        metadata: {
          itemCount: fullItems.length,
          startDate: body?.startDate ?? null,
          endDate: body?.endDate ?? null,
        },
        ipAddress,
        userAgent,
      })

      const jsonData = JSON.stringify(exportPayload, null, 2)

      return reply
        .status(200)
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="vault-export-${Date.now()}.json"`)
        .send(jsonData)
    },
  })

  // GET /api/admin/vault/:vaultId — Get vault item details
  app.get('/:vaultId', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { vaultId } = request.params as { vaultId: string }

      const result = await getVaultItem(vaultId)

      // Audit log access to individual vault item
      await logAudit({
        actorId: id,
        actorType: 'user',
        action: 'vault.accessed',
        targetType: 'vault_item',
        targetId: vaultId,
        ipAddress,
        userAgent,
      })

      return reply.status(200).send(result)
    },
  })

  // POST /api/admin/vault/:vaultId/purge — Request early purge
  // Super admin only, requires re-authentication (spec Section 16.7)
  app.post('/:vaultId/purge', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    preHandler: [authenticate, requireRole('super_admin'), requireReauth],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { vaultId } = request.params as { vaultId: string }
      const result = await requestEarlyPurge(vaultId, id, ipAddress, userAgent)
      return reply.status(202).send(result)
    },
  })

  // DELETE /api/admin/vault/:vaultId/purge — Cancel a pending early purge
  app.delete('/:vaultId/purge', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
      },
    },
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { vaultId } = request.params as { vaultId: string }
      const result = await cancelPurge(vaultId, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })
}
