/**
 * Venue routes — CRUD, membership management, positions.
 *
 * Spec references: Section 6
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireRole, requireVenueRole } from '../../middleware/roles.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import { createVenueSchema, updateVenueSchema } from '@smoker/shared'
import {
  listVenues,
  createVenue,
  getVenueById,
  updateVenue,
  archiveVenue,
  unarchiveVenue,
  listVenueMembers,
  addVenueMember,
  removeVenueMember,
  changeVenueRole,
  listVenueChannels,
  listPositions,
  createPosition,
  updatePosition,
  deletePosition,
} from '../../services/venue.service.js'

// ---------------------------------------------------------------------------
// Inline Zod schemas
// ---------------------------------------------------------------------------

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  venueRole: z.enum(['basic', 'mid', 'admin']).default('basic'),
})

const changeVenueRoleSchema = z.object({
  venueRole: z.enum(['basic', 'mid', 'admin']),
})

const createPositionSchema = z.object({
  name: z.string().min(1).max(100).trim(),
})

const updatePositionSchema = z.object({
  name: z.string().min(1).max(100).trim(),
})

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function venueRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/venues — List all venues
  app.get('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const result = await listVenues(id, orgRole)
      return reply.status(200).send(result)
    },
  })

  // POST /api/venues — Create a new venue
  // Only org-level Admin+ can create venues (spec Section 5.2)
  app.post('/', {
    preHandler: [authenticate, requireRole('admin', 'super_admin'), validateBody(createVenueSchema)],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as { name: string; address: string }
      const venue = await createVenue(body, id, ipAddress, userAgent)
      return reply.status(201).send(venue)
    },
  })

  // GET /api/venues/:venueId — Get venue details
  app.get('/:venueId', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { venueId } = request.params as { venueId: string }
      const venue = await getVenueById(venueId, id, orgRole)
      return reply.status(200).send(venue)
    },
  })

  // PATCH /api/venues/:venueId — Update venue settings
  // Venue-scoped Admin or org Admin+ (spec Section 6.2)
  app.patch('/:venueId', {
    preHandler: [
      authenticate,
      requireVenueRole('venueId', 'admin', 'super_admin'),
      validateBody(updateVenueSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { venueId } = request.params as { venueId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const body = request.body as { name?: string; address?: string }
      const updated = await updateVenue(venueId, body, id, ipAddress, userAgent)
      return reply.status(200).send(updated)
    },
  })

  // POST /api/venues/:venueId/archive — Archive a venue
  // Super admin only (spec Section 6.3)
  app.post('/:venueId/archive', {
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { venueId } = request.params as { venueId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await archiveVenue(venueId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // POST /api/venues/:venueId/unarchive — Unarchive a venue
  // Super admin only (spec Section 6.3)
  app.post('/:venueId/unarchive', {
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { venueId } = request.params as { venueId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await unarchiveVenue(venueId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // GET /api/venues/:venueId/members — List venue members
  app.get('/:venueId/members', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { venueId } = request.params as { venueId: string }
      const members = await listVenueMembers(venueId)
      return reply.status(200).send(members)
    },
  })

  // POST /api/venues/:venueId/members — Add user to venue
  app.post('/:venueId/members', {
    preHandler: [
      authenticate,
      requireVenueRole('venueId', 'admin', 'super_admin'),
      validateBody(addMemberSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { venueId } = request.params as { venueId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { userId, venueRole } = request.body as { userId: string; venueRole: string }
      const result = await addVenueMember(venueId, userId, venueRole, id, ipAddress, userAgent)
      return reply.status(201).send(result)
    },
  })

  // DELETE /api/venues/:venueId/members/:userId — Remove user from venue
  app.delete('/:venueId/members/:userId', {
    preHandler: [authenticate, requireVenueRole('venueId', 'admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { venueId, userId } = request.params as { venueId: string; userId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await removeVenueMember(venueId, userId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // PATCH /api/venues/:venueId/members/:userId/role — Change user's venue role
  app.patch('/:venueId/members/:userId/role', {
    preHandler: [
      authenticate,
      requireVenueRole('venueId', 'admin', 'super_admin'),
      validateBody(changeVenueRoleSchema),
    ],
    handler: async (request, reply) => {
      const { id, orgRole } = request.user!
      const { venueId, userId } = request.params as { venueId: string; userId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { venueRole } = request.body as { venueRole: string }
      await changeVenueRole(venueId, userId, venueRole, id, orgRole, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })

  // GET /api/venues/:venueId/channels — List venue-scoped channels
  app.get('/:venueId/channels', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { venueId } = request.params as { venueId: string }
      const result = await listVenueChannels(venueId)
      return reply.status(200).send(result)
    },
  })

  // --- Position management (Admin-configurable list, spec Section 4.2) ---

  // GET /api/venues/positions — List all positions (org-wide)
  app.get('/positions/list', {
    preHandler: [authenticate],
    handler: async (_request, reply) => {
      const result = await listPositions()
      return reply.status(200).send(result)
    },
  })

  // POST /api/venues/positions — Create a position
  app.post('/positions', {
    preHandler: [
      authenticate,
      requireRole('admin', 'super_admin'),
      validateBody(createPositionSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { name } = request.body as { name: string }
      const position = await createPosition(name, id, ipAddress, userAgent)
      return reply.status(201).send(position)
    },
  })

  // PATCH /api/venues/positions/:positionId — Update a position
  app.patch('/positions/:positionId', {
    preHandler: [
      authenticate,
      requireRole('admin', 'super_admin'),
      validateBody(updatePositionSchema),
    ],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { positionId } = request.params as { positionId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      const { name } = request.body as { name: string }
      const position = await updatePosition(positionId, name, id, ipAddress, userAgent)
      return reply.status(200).send(position)
    },
  })

  // DELETE /api/venues/positions/:positionId — Delete a position
  app.delete('/positions/:positionId', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.user!
      const { positionId } = request.params as { positionId: string }
      const { ipAddress, userAgent } = extractAuditContext(request)
      await deletePosition(positionId, id, ipAddress, userAgent)
      return reply.status(200).send({ success: true })
    },
  })
}
