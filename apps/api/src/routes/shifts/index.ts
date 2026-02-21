/**
 * Shift routes — CRUD, shift swaps, roster views.
 *
 * Spec references: Section 15.2
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireRole, requireVenueRole } from '../../middleware/roles.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import { createShiftSchema, requestSwapSchema, paginationQuerySchema } from '@smoker/shared'
import {
  getMyShifts,
  getVenueRoster,
  createShift,
  getShift,
  updateShift,
  deleteShift,
  requestSwap,
  acceptSwap,
  declineSwap,
  overrideSwap,
  listMySwaps,
  listVenueSwaps,
} from '../../services/shift.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas
// ---------------------------------------------------------------------------

const shiftListQuerySchema = paginationQuerySchema.extend({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

const venueRosterQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

const updateShiftSchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  roleLabel: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  expectedVersion: z.number().int().positive(),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function shiftRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/shifts/my — Get current user's shifts across all venues
  app.get('/my', {
    schema: {
      summary: 'Get my shifts',
      description: 'Returns the current user\'s shifts across all venues, filterable by date range.',
      tags: ['Shifts'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time', description: 'Filter shifts starting after this date' },
          endDate: { type: 'string', format: 'date-time', description: 'Filter shifts ending before this date' },
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            nextCursor: { type: 'string', nullable: true },
          },
        },
        422: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const parsed = shiftListQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { startDate, endDate, cursor, limit } = parsed.data
      const result = await getMyShifts(id, {
        startDate,
        endDate,
        cursor,
        limit,
      })
      return reply.status(200).send(result)
    },
  })

  // GET /api/shifts/venue/:venueId — Get venue roster
  app.get('/venue/:venueId', {
    schema: {
      summary: 'Get venue roster',
      description: 'Returns the shift roster for a venue, filterable by date range.',
      tags: ['Shifts'],
      params: { type: 'object', required: ['venueId'], properties: { venueId: { type: 'string', format: 'uuid' } } },
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
        },
      },
      response: {
        200: { type: 'array', items: { type: 'object' } },
        422: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { venueId } = request.params as { venueId: string }
      const parsed = venueRosterQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { startDate, endDate } = parsed.data
      const result = await getVenueRoster(venueId, {
        startDate,
        endDate,
      })
      return reply.status(200).send(result)
    },
  })

  // POST /api/shifts — Create a shift
  // Admin (org-wide) or venue-scoped Admin (spec Section 15.2)
  app.post('/', {
    schema: {
      summary: 'Create shift',
      description: 'Creates a new shift assignment. Admin or Super admin only.',
      tags: ['Shifts'],
      body: {
        type: 'object',
        required: ['venueId', 'userId', 'startTime', 'endTime'],
        properties: {
          venueId: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid', description: 'User assigned to the shift' },
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time' },
          roleLabel: { type: 'string', maxLength: 100, description: 'Role/position label for this shift' },
          notes: { type: 'string', maxLength: 1000 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            venueId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            startTime: { type: 'string', format: 'date-time' },
            endTime: { type: 'string', format: 'date-time' },
            roleLabel: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin'), validateBody(createShiftSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as {
        venueId: string
        userId: string
        startTime: string
        endTime: string
        roleLabel?: string
        notes?: string
      }
      const result = await createShift(body, id, ipAddress, userAgent)
      return reply.status(201).send(result)
    },
  })

  // GET /api/shifts/:shiftId — Get shift details
  app.get('/:shiftId', {
    schema: {
      summary: 'Get shift details',
      description: 'Returns details for a specific shift.',
      tags: ['Shifts'],
      params: { type: 'object', required: ['shiftId'], properties: { shiftId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object' },
        404: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { shiftId } = request.params as { shiftId: string }
      const result = await getShift(shiftId)
      return reply.status(200).send(result)
    },
  })

  // PATCH /api/shifts/:shiftId — Update a shift
  app.patch('/:shiftId', {
    schema: {
      summary: 'Update shift',
      description: 'Updates shift details. Uses optimistic concurrency via expectedVersion. Admin or Super admin only.',
      tags: ['Shifts'],
      params: { type: 'object', required: ['shiftId'], properties: { shiftId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['expectedVersion'],
        properties: {
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time' },
          roleLabel: { type: 'string', maxLength: 100 },
          notes: { type: 'string', maxLength: 1000 },
          expectedVersion: { type: 'integer', description: 'Optimistic concurrency version' },
        },
      },
      response: {
        200: { type: 'object' },
        409: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin'), validateBody(updateShiftSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { shiftId } = request.params as { shiftId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { expectedVersion, ...data } = request.body as {
        startTime?: string
        endTime?: string
        roleLabel?: string
        notes?: string
        expectedVersion: number
      }
      const result = await updateShift(shiftId, data, expectedVersion, id, ipAddress, userAgent)
      return reply.status(200).send(result)
    },
  })

  // DELETE /api/shifts/:shiftId — Cancel/delete a shift
  app.delete('/:shiftId', {
    schema: {
      summary: 'Delete shift',
      description: 'Cancels/deletes a shift. Admin or Super admin only.',
      tags: ['Shifts'],
      params: { type: 'object', required: ['shiftId'], properties: { shiftId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { shiftId } = request.params as { shiftId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await deleteShift(shiftId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // --- Shift swap workflow (spec Section 15.2) ---

  // POST /api/shifts/:shiftId/swap-request — Request a swap
  app.post('/:shiftId/swap-request', {
    schema: {
      summary: 'Request shift swap',
      description: 'Requests a shift swap with another user.',
      tags: ['Shifts'],
      params: { type: 'object', required: ['shiftId'], properties: { shiftId: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['shiftId', 'targetUserId', 'targetShiftId'],
        properties: {
          shiftId: { type: 'string', format: 'uuid' },
          targetUserId: { type: 'string', format: 'uuid' },
          targetShiftId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        201: { type: 'object' },
      },
    },
    preHandler: [authenticate, validateBody(requestSwapSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as {
        shiftId: string
        targetUserId: string
        targetShiftId: string
      }
      const result = await requestSwap(body, id, ipAddress, userAgent)
      return reply.status(201).send(result)
    },
  })

  // POST /api/shifts/swaps/:swapId/accept — Accept a swap request
  app.post('/swaps/:swapId/accept', {
    schema: {
      summary: 'Accept swap request',
      description: 'Accepts a pending shift swap request.',
      tags: ['Shifts'],
      params: { type: 'object', required: ['swapId'], properties: { swapId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { swapId } = request.params as { swapId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await acceptSwap(swapId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // POST /api/shifts/swaps/:swapId/decline — Decline a swap request
  app.post('/swaps/:swapId/decline', {
    schema: {
      summary: 'Decline swap request',
      description: 'Declines a pending shift swap request.',
      tags: ['Shifts'],
      params: { type: 'object', required: ['swapId'], properties: { swapId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { swapId } = request.params as { swapId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await declineSwap(swapId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // POST /api/shifts/swaps/:swapId/override — Admin override (force-accept swap)
  app.post('/swaps/:swapId/override', {
    schema: {
      summary: 'Override swap request',
      description: 'Force-accepts a shift swap. Admin or Super admin only.',
      tags: ['Shifts'],
      params: { type: 'object', required: ['swapId'], properties: { swapId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' } } },
      },
    },
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { swapId } = request.params as { swapId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await overrideSwap(swapId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // GET /api/shifts/swaps — List swap requests (for current user)
  app.get('/swaps', {
    schema: {
      summary: 'List my swap requests',
      description: 'Returns paginated swap requests involving the current user.',
      tags: ['Shifts'],
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            nextCursor: { type: 'string', nullable: true },
          },
        },
        422: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.user!
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await listMySwaps(id, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // GET /api/shifts/swaps/venue/:venueId — List venue swap requests (Admin view)
  app.get('/swaps/venue/:venueId', {
    schema: {
      summary: 'List venue swap requests',
      description: 'Returns paginated swap requests for a venue. Venue admin only.',
      tags: ['Shifts'],
      params: { type: 'object', required: ['venueId'], properties: { venueId: { type: 'string', format: 'uuid' } } },
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            nextCursor: { type: 'string', nullable: true },
          },
        },
        422: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
      },
    },
    preHandler: [authenticate, requireVenueRole('venueId', 'admin', 'super_admin')],
    handler: async (request, reply) => {
      const { venueId } = request.params as { venueId: string }
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await listVenueSwaps(venueId, cursor, limit)
      return reply.status(200).send(result)
    },
  })
}
