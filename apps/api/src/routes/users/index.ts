/**
 * User routes — CRUD, role management, status changes, force-logout.
 *
 * Spec references: Sections 4, 5
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { requireRole } from '../../middleware/roles.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import {
  updateProfileSchema,
  updateUserProfileSchema,
  updatePreferencesSchema,
  avatarUploadSchema,
} from '@smoker/shared'
import { forceLogoutUser } from '../../services/auth.service.js'
import {
  listUsers,
  getMe,
  getUserById,
  updateProfile,
  updateUserProfile,
  updatePreferences,
  getAvatarUploadUrl,
  removeAvatar,
  getUserProfile,
  changeOrgRole,
  suspendUser,
  unsuspendUser,
  deactivateUser,
  reactivateUser,
  listUserSessions,
  unlockUser,
} from '../../services/user.service.js'

// ---------------------------------------------------------------------------
// Inline validation schemas
// ---------------------------------------------------------------------------

const changeRoleSchema = z.object({
  role: z.enum(['basic', 'mid', 'admin', 'super_admin']),
})

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/users — List users (paginated, filterable)
  // Admin and Super admin only
  app.get('/', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const query = request.query as {
        status?: string
        role?: string
        venueId?: string
        cursor?: string
        limit?: string
      }

      const result = await listUsers({
        status: query.status,
        role: query.role,
        venueId: query.venueId,
        cursor: query.cursor,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      })

      return reply.status(200).send(result)
    },
  })

  // GET /api/users/me — Get current user profile
  app.get('/me', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const user = request.user!
      const result = await getMe(user.id)

      return reply.status(200).send(result)
    },
  })

  // GET /api/users/:id — Get user by ID
  app.get('/:id', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user!

      const result = await getUserById(id, user.id, user.orgRole)

      return reply.status(200).send(result)
    },
  })

  // PATCH /api/users/me — Update current user profile
  app.patch('/me', {
    preHandler: [authenticate, validateBody(updateProfileSchema)],
    handler: async (request, reply) => {
      const user = request.user!
      const data = request.body as {
        fullName?: string
        email?: string
        address?: string
        positionId?: string
        timezone?: string
        quietHoursEnabled?: boolean
      }
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await updateProfile(user.id, data, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // PATCH /api/users/me/profile — Update profile fields (displayName, bio, timezone)
  app.patch('/me/profile', {
    preHandler: [authenticate, validateBody(updateUserProfileSchema)],
    handler: async (request, reply) => {
      const user = request.user!
      const data = request.body as {
        displayName?: string
        bio?: string
        timezone?: string
      }
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await updateUserProfile(user.id, data, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // PATCH /api/users/me/preferences — Update app preferences (theme, notifications)
  app.patch('/me/preferences', {
    preHandler: [authenticate, validateBody(updatePreferencesSchema)],
    handler: async (request, reply) => {
      const user = request.user!
      const data = request.body as {
        theme?: string
        notificationSound?: boolean
        notificationDesktop?: boolean
      }
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await updatePreferences(user.id, data, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // POST /api/users/me/avatar — Upload avatar (presigned URL flow)
  app.post('/me/avatar', {
    preHandler: [authenticate, validateBody(avatarUploadSchema)],
    handler: async (request, reply) => {
      const user = request.user!
      const { contentType } = request.body as { contentType: string }

      const result = await getAvatarUploadUrl(user.id, contentType)

      return reply.status(200).send(result)
    },
  })

  // DELETE /api/users/me/avatar — Remove avatar
  app.delete('/me/avatar', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await removeAvatar(user.id, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // GET /api/users/:userId/profile — View another user's public profile
  app.get('/:id/profile', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }

      const result = await getUserProfile(id)

      return reply.status(200).send(result)
    },
  })

  // PATCH /api/users/:id/role — Change user's org role
  // Admin: can assign basic, mid. Super admin: can assign basic, mid, admin, super_admin.
  app.patch('/:id/role', {
    preHandler: [authenticate, requireRole('admin', 'super_admin'), validateBody(changeRoleSchema)],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const { role } = request.body as { role: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await changeOrgRole(id, role, user.id, user.orgRole, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // POST /api/users/:id/suspend — Suspend a user
  app.post('/:id/suspend', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await suspendUser(id, user.id, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // POST /api/users/:id/unsuspend — Unsuspend a user
  app.post('/:id/unsuspend', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await unsuspendUser(id, user.id, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // POST /api/users/:id/deactivate — Deactivate a user
  app.post('/:id/deactivate', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await deactivateUser(id, user.id, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // POST /api/users/:id/reactivate — Reactivate a deactivated user
  // Super admin only (spec Section 4.5)
  app.post('/:id/reactivate', {
    preHandler: [authenticate, requireRole('super_admin')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await reactivateUser(id, user.id, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // POST /api/users/:id/force-logout — Force logout a user
  // Admin and Super admin (spec Section 3.5)
  app.post('/:id/force-logout', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await forceLogoutUser(id, user.id, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })

  // GET /api/users/:id/sessions — List user's active sessions
  // Admin and Super admin
  app.get('/:id/sessions', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }

      const sessions = await listUserSessions(id)

      return reply.status(200).send({ sessions })
    },
  })

  // POST /api/users/:id/unlock — Unlock a locked account
  // Admin and Super admin (spec Section 3.2)
  app.post('/:id/unlock', {
    preHandler: [authenticate, requireRole('admin', 'super_admin')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user!
      const { ipAddress, userAgent } = extractAuditContext(request)

      const result = await unlockUser(id, user.id, ipAddress, userAgent)

      return reply.status(200).send(result)
    },
  })
}
