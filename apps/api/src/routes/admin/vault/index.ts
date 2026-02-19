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
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (_request, reply) => {
      const result = await listPendingPurges()
      return reply.status(200).send(result)
    },
  })

  // POST /api/admin/vault/export — Export vault content
  // Super admin only, audit logged
  app.post('/export', {
    preHandler: [authenticate, requireRole('super_admin'), requireReauth],
    handler: async (_request, reply) => {
      // TODO: Implement vault export (encrypted output, same as data export)
      return reply.status(501).send({
        error: 'NOT_IMPLEMENTED',
        message: 'Vault export is not yet implemented.',
      })
    },
  })

  // GET /api/admin/vault/:vaultId — Get vault item details
  app.get('/:vaultId', {
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
