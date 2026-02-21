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
import { createVenueSchema, updateVenueSchema, paginationQuerySchema } from '@smoker/shared'
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
    schema: { summary: 'List venues', description: 'Returns all venues visible to the current user.', tags: ['Venues'], response: { 200: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, address: { type: 'string' }, isArchived: { type: 'boolean' } } } } } },
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
    schema: { summary: 'Create venue', description: 'Creates a new venue. Admin or Super admin only.', tags: ['Venues'], body: { type: 'object', required: ['name', 'address'], properties: { name: { type: 'string' }, address: { type: 'string' } } }, response: { 201: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, address: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } } } } },
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
    schema: { summary: 'Get venue details', description: 'Returns full details for a venue.', tags: ['Venues'], params: { type: 'object', required: ['venueId'], properties: { venueId: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object' }, 404: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } } } },
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
    schema: { summary: 'Update venue', description: 'Updates venue name or address. Venue admin or org Admin+.', tags: ['Venues'], params: { type: 'object', required: ['venueId'], properties: { venueId: { type: 'string', format: 'uuid' } } }, body: { type: 'object', properties: { name: { type: 'string' }, address: { type: 'string' } } }, response: { 200: { type: 'object' } } },
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
    schema: { summary: 'Archive venue', description: 'Archives a venue. Super admin only.', tags: ['Venues'], params: { type: 'object', required: ['venueId'], properties: { venueId: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } } },
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
    schema: { summary: 'Unarchive venue', description: 'Restores an archived venue. Super admin only.', tags: ['Venues'], params: { type: 'object', required: ['venueId'], properties: { venueId: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } } },
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
    schema: { summary: 'List venue members', description: 'Returns paginated venue members.', tags: ['Venues'], params: { type: 'object', required: ['venueId'], properties: { venueId: { type: 'string', format: 'uuid' } } }, querystring: { type: 'object', properties: { cursor: { type: 'string' }, limit: { type: 'integer' } } }, response: { 200: { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } }, nextCursor: { type: 'string', nullable: true } } }, 422: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } } } },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { venueId } = request.params as { venueId: string }
      const parsed = paginationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Validation failed' } })
      const { cursor, limit } = parsed.data
      const result = await listVenueMembers(venueId, cursor, limit)
      return reply.status(200).send(result)
    },
  })

  // POST /api/venues/:venueId/members — Add user to venue
  app.post('/:venueId/members', {
    schema: { summary: 'Add venue member', description: 'Adds a user to a venue with a specified role. Venue admin required.', tags: ['Venues'], params: { type: 'object', required: ['venueId'], properties: { venueId: { type: 'string', format: 'uuid' } } }, body: { type: 'object', required: ['userId'], properties: { userId: { type: 'string', format: 'uuid' }, venueRole: { type: 'string', enum: ['basic', 'mid', 'admin'], default: 'basic' } } }, response: { 201: { type: 'object', properties: { success: { type: 'boolean' } } } } },
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
    schema: { summary: 'Remove venue member', description: 'Removes a user from a venue.', tags: ['Venues'], params: { type: 'object', required: ['venueId', 'userId'], properties: { venueId: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } } },
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
    schema: { summary: 'Change venue member role', description: 'Changes a user\'s role within a venue.', tags: ['Venues'], params: { type: 'object', required: ['venueId', 'userId'], properties: { venueId: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' } } }, body: { type: 'object', required: ['venueRole'], properties: { venueRole: { type: 'string', enum: ['basic', 'mid', 'admin'] } } }, response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } } } },
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
    schema: { summary: 'List venue channels', description: 'Returns all channels scoped to a venue.', tags: ['Venues'], params: { type: 'object', required: ['venueId'], properties: { venueId: { type: 'string', format: 'uuid' } } }, response: { 200: { type: 'array', items: { type: 'object' } } } },
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
    schema: { summary: 'List positions', description: 'Returns all positions defined across the org.', tags: ['Venues'], response: { 200: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } } } } },
    preHandler: [authenticate],
    handler: async (_request, reply) => {
      const result = await listPositions()
      return reply.status(200).send(result)
    },
  })

  // POST /api/venues/positions — Create a position
  app.post('/positions', {
    schema: { summary: 'Create position', description: 'Creates a new position. Admin or Super admin only.', tags: ['Venues'], body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 100 } } }, response: { 201: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } } } } },
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
    schema: { summary: 'Update position', description: 'Updates a position name. Admin or Super admin only.', tags: ['Venues'], params: { type: 'object', required: ['positionId'], properties: { positionId: { type: 'string', format: 'uuid' } } }, body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 100 } } }, response: { 200: { type: 'object' } } },
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
    schema: {
      summary: 'Delete position',
      description: 'Deletes a position. Admin or Super admin only.',
      tags: ['Venues'],
      params: {
        type: 'object',
        required: ['positionId'],
        properties: {
          positionId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
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
