/**
 * DM routes -- Create, list, manage direct messages.
 *
 * Spec references: Section 7.4
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireRole, requireDmMembership } from '../../middleware/roles.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import { createDmSchema } from '@smoker/shared'
import {
  listDms,
  createDm,
  getDmById,
  listDmMembers,
  addDmMembers,
  removeDmMember,
  leaveDm,
  dissolveDm,
  getDmMessages,
} from '../../services/dm.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas
// ---------------------------------------------------------------------------

const addDmMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(50),
})

const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function dmRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/dms -- List user's DMs
  app.get('/', {
    preHandler: [authenticate, validateQuery(paginationQuerySchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { cursor, limit } = request.query as { cursor?: string; limit: number }
      const result = await listDms(id, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // POST /api/dms -- Create a new DM or group DM
  // Rate limit: 20 new DM conversations per hour per user (spec Section 7.4)
  app.post('/', {
    preHandler: [authenticate, validateBody(createDmSchema)],
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 hour',
      },
    },
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { type, memberUserIds } = request.body as {
        type: 'direct' | 'group'
        memberUserIds: string[]
      }
      const dm = await createDm(type, memberUserIds, id, ipAddress, userAgent)
      return reply.status(201).send(dm)
    },
  })

  // GET /api/dms/:dmId -- Get DM details
  app.get('/:dmId', {
    preHandler: [authenticate, requireDmMembership('dmId')],
    handler: async (request, reply) => {
      const { dmId } = request.params as { dmId: string }
      const dm = await getDmById(dmId)
      return reply.status(200).send(dm)
    },
  })

  // GET /api/dms/:dmId/members -- List DM members
  app.get('/:dmId/members', {
    preHandler: [authenticate, requireDmMembership('dmId')],
    handler: async (request, reply) => {
      const { dmId } = request.params as { dmId: string }
      const members = await listDmMembers(dmId)
      return reply.status(200).send(members)
    },
  })

  // POST /api/dms/:dmId/members -- Add members to group DM
  app.post('/:dmId/members', {
    preHandler: [authenticate, requireDmMembership('dmId'), validateBody(addDmMembersSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { dmId } = request.params as { dmId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { userIds } = request.body as { userIds: string[] }
      await addDmMembers(dmId, userIds, id, ipAddress, userAgent)
      return reply.status(201).send({ success: true })
    },
  })

  // DELETE /api/dms/:dmId/members/:userId -- Remove member from group DM
  app.delete('/:dmId/members/:userId', {
    preHandler: [authenticate, requireDmMembership('dmId')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { dmId, userId } = request.params as { dmId: string; userId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await removeDmMember(dmId, userId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // POST /api/dms/:dmId/leave -- Leave a group DM
  app.post('/:dmId/leave', {
    preHandler: [authenticate, requireDmMembership('dmId')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { dmId } = request.params as { dmId: string }
      await leaveDm(dmId, id)
      return reply.status(200).send({ success: true })
    },
  })

  // POST /api/dms/:dmId/dissolve -- Dissolve (close) a group DM
  // Admin can dissolve abusive group DMs (spec Section 7.4)
  app.post('/:dmId/dissolve', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { dmId } = request.params as { dmId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await dissolveDm(dmId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // GET /api/dms/:dmId/messages -- Get DM messages (paginated)
  app.get('/:dmId/messages', {
    preHandler: [
      authenticate,
      requireDmMembership('dmId'),
      validateQuery(paginationQuerySchema),
    ],
    handler: async (request, reply) => {
      const { dmId } = request.params as { dmId: string }
      const { cursor, limit } = request.query as { cursor?: string; limit: number }
      const result = await getDmMessages(dmId, cursor, limit)
      return reply.status(200).send(result)
    },
  })
}
