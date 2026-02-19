/**
 * Invite routes — Send, list, resend, verify, and cancel invites.
 *
 * Spec references: Section 4.1
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/roles.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import {
  sendInvite,
  listInvites,
  resendInvite,
  verifyInvite,
  cancelInvite,
} from '../../services/invite.service.js'

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const sendInviteSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Invalid phone number format'),
})

const verifyInviteSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  signature: z.string().min(1, 'Signature is required'),
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Invalid phone number format'),
})

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/invites — Send an invite
  // Only Admin and Super admin can send invites (spec Section 4.1)
  app.post('/', {
    preHandler: [authenticate, requireRole('admin', 'super_admin'), validateBody(sendInviteSchema)],
    handler: async (request, reply) => {
      const { phone } = request.body as { phone: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await sendInvite(phone, user.id, ipAddress, userAgent)

      return reply.status(201).send(result)
    },
  })

  // GET /api/invites — List all invites
  // Admin and Super admin only
  app.get('/', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const query = request.query as { cursor?: string; limit?: string }
      const cursor = query.cursor || undefined
      const limit = query.limit ? parseInt(query.limit, 10) : undefined

      const result = await listInvites(cursor, limit)

      return reply.status(200).send(result)
    },
  })

  // POST /api/invites/:id/resend — Resend an invite
  app.post('/:id/resend', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await resendInvite(id, user.id, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // POST /api/invites/verify — Verify an invite token (public endpoint)
  // Rate limit: 10 per hour per IP (spec Section 4.1)
  app.post('/verify', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 hour',
      },
    },
    preHandler: [validateBody(verifyInviteSchema)],
    handler: async (request, reply) => {
      const { token, signature, phone } = request.body as {
        token: string
        signature: string
        phone: string
      }

      const result = await verifyInvite(token, signature, phone)

      return reply.status(200).send(result)
    },
  })

  // DELETE /api/invites/:id — Cancel/revoke an invite
  app.delete('/:id', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await cancelInvite(id, user.id, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })
}
