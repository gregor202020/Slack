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
// Shared schema fragments
// ---------------------------------------------------------------------------

const errorResponse = {
  type: 'object' as const,
  properties: {
    error: {
      type: 'object' as const,
      properties: {
        code: { type: 'string' as const },
        message: { type: 'string' as const },
      },
    },
  },
}

const successResponse = {
  type: 'object' as const,
  properties: {
    success: { type: 'boolean' as const },
  },
}

const dmIdParam = {
  type: 'object' as const,
  required: ['dmId'],
  properties: {
    dmId: { type: 'string' as const, format: 'uuid', description: 'DM conversation ID' },
  },
}

const paginationQuery = {
  type: 'object' as const,
  properties: {
    cursor: { type: 'string' as const, description: 'Cursor for pagination' },
    limit: { type: 'integer' as const, minimum: 1, maximum: 100, default: 25 },
  },
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function dmRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/dms -- List user's DMs
  app.get('/', {
    schema: {
      summary: 'List DM conversations',
      description: 'Returns a paginated list of the current user\'s DM conversations.',
      tags: ['DMs'],
      querystring: paginationQuery,
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
                  type: { type: 'string', enum: ['direct', 'group'] },
                  memberCount: { type: 'integer' },
                  lastMessageAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            nextCursor: { type: 'string', nullable: true },
          },
        },
      },
    },
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
    schema: {
      summary: 'Create DM conversation',
      description: 'Creates a new direct or group DM conversation.',
      tags: ['DMs'],
      body: {
        type: 'object',
        required: ['type', 'memberUserIds'],
        properties: {
          type: { type: 'string', enum: ['direct', 'group'], description: 'DM type' },
          memberUserIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            minItems: 1,
            description: 'User IDs to include in the DM',
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        422: errorResponse,
      },
    },
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
    schema: {
      summary: 'Get DM details',
      description: 'Returns details for a specific DM conversation.',
      tags: ['DMs'],
      params: dmIdParam,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            memberCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        404: errorResponse,
      },
    },
    preHandler: [authenticate, requireDmMembership('dmId')],
    handler: async (request, reply) => {
      const { dmId } = request.params as { dmId: string }
      const dm = await getDmById(dmId)
      return reply.status(200).send(dm)
    },
  })

  // GET /api/dms/:dmId/members -- List DM members
  app.get('/:dmId/members', {
    schema: {
      summary: 'List DM members',
      description: 'Returns all members in the DM conversation.',
      tags: ['DMs'],
      params: dmIdParam,
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string', format: 'uuid' },
              fullName: { type: 'string' },
              displayName: { type: 'string' },
              joinedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    preHandler: [authenticate, requireDmMembership('dmId')],
    handler: async (request, reply) => {
      const { dmId } = request.params as { dmId: string }
      const members = await listDmMembers(dmId)
      return reply.status(200).send(members)
    },
  })

  // POST /api/dms/:dmId/members -- Add members to group DM
  app.post('/:dmId/members', {
    schema: {
      summary: 'Add DM members',
      description: 'Adds one or more users to a group DM conversation.',
      tags: ['DMs'],
      params: dmIdParam,
      body: {
        type: 'object',
        required: ['userIds'],
        properties: {
          userIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
            minItems: 1,
            maxItems: 50,
          },
        },
      },
      response: {
        201: successResponse,
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Remove DM member',
      description: 'Removes a user from a group DM conversation.',
      tags: ['DMs'],
      params: {
        type: 'object',
        required: ['dmId', 'userId'],
        properties: {
          dmId: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid', description: 'User ID to remove' },
        },
      },
      response: {
        200: successResponse,
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Leave group DM',
      description: 'Removes the current user from a group DM conversation.',
      tags: ['DMs'],
      params: dmIdParam,
      response: {
        200: successResponse,
      },
    },
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
    schema: {
      summary: 'Dissolve group DM',
      description: 'Permanently closes a group DM. Admin or Super admin only.',
      tags: ['DMs'],
      params: dmIdParam,
      response: {
        200: successResponse,
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Get DM messages',
      description: 'Returns paginated messages for a DM conversation.',
      tags: ['DMs'],
      params: dmIdParam,
      querystring: paginationQuery,
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
                  body: { type: 'string' },
                  senderId: { type: 'string', format: 'uuid' },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            nextCursor: { type: 'string', nullable: true },
          },
        },
      },
    },
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
