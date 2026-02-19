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
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { shiftId } = request.params as { shiftId: string }
      const result = await getShift(shiftId)
      return reply.status(200).send(result)
    },
  })

  // PATCH /api/shifts/:shiftId — Update a shift
  app.patch('/:shiftId', {
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
