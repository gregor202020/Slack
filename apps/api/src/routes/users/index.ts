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

const userIdParam = {
  type: 'object' as const,
  required: ['id'],
  properties: {
    id: { type: 'string' as const, format: 'uuid', description: 'User ID' },
  },
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/users — List users (paginated, filterable)
  // Admin and Super admin only
  app.get('/', {
    schema: {
      summary: 'List users',
      description: 'Returns a paginated, filterable list of all users. Admin or Super admin only.',
      tags: ['Users'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by user status' },
          role: { type: 'string', description: 'Filter by org role' },
          venueId: { type: 'string', format: 'uuid', description: 'Filter by venue membership' },
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        },
      },
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
                  fullName: { type: 'string' },
                  phone: { type: 'string' },
                  orgRole: { type: 'string' },
                  status: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            nextCursor: { type: 'string', nullable: true },
          },
        },
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Get current user',
      description: 'Returns the authenticated user\'s full profile.',
      tags: ['Users'],
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            phone: { type: 'string' },
            fullName: { type: 'string' },
            displayName: { type: 'string' },
            email: { type: 'string' },
            orgRole: { type: 'string' },
            status: { type: 'string' },
            bio: { type: 'string' },
            timezone: { type: 'string' },
            avatarUrl: { type: 'string', nullable: true },
            onboardingComplete: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        401: errorResponse,
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const user = request.user!
      const result = await getMe(user.id)

      return reply.status(200).send(result)
    },
  })

  // GET /api/users/:id — Get user by ID
  app.get('/:id', {
    schema: {
      summary: 'Get user by ID',
      description: 'Returns a user\'s profile by their ID. Visible fields depend on viewer role.',
      tags: ['Users'],
      params: userIdParam,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fullName: { type: 'string' },
            displayName: { type: 'string' },
            orgRole: { type: 'string' },
            status: { type: 'string' },
            avatarUrl: { type: 'string', nullable: true },
          },
        },
        404: errorResponse,
      },
    },
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
    schema: {
      summary: 'Update profile',
      description: 'Updates the current user\'s profile fields (name, email, address, etc).',
      tags: ['Users'],
      body: {
        type: 'object',
        properties: {
          fullName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          address: { type: 'string' },
          positionId: { type: 'string', format: 'uuid' },
          timezone: { type: 'string' },
          quietHoursEnabled: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fullName: { type: 'string' },
            email: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        422: errorResponse,
      },
    },
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
    schema: {
      summary: 'Update display profile',
      description: 'Updates display-oriented profile fields like display name, bio, and timezone.',
      tags: ['Users'],
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string', maxLength: 80 },
          bio: { type: 'string', maxLength: 500 },
          timezone: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            displayName: { type: 'string' },
            bio: { type: 'string' },
            timezone: { type: 'string' },
          },
        },
      },
    },
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
    schema: {
      summary: 'Update preferences',
      description: 'Updates the current user\'s app preferences (theme, notification settings).',
      tags: ['Users'],
      body: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: ['light', 'dark', 'system'] },
          notificationSound: { type: 'boolean' },
          notificationDesktop: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            theme: { type: 'string' },
            notificationSound: { type: 'boolean' },
            notificationDesktop: { type: 'boolean' },
          },
        },
      },
    },
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
    schema: {
      summary: 'Get avatar upload URL',
      description: 'Returns a presigned S3 URL for uploading a new avatar image.',
      tags: ['Users'],
      body: {
        type: 'object',
        required: ['contentType'],
        properties: {
          contentType: { type: 'string', description: 'MIME type (e.g., image/png, image/jpeg)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            uploadUrl: { type: 'string', description: 'Presigned S3 upload URL' },
            avatarUrl: { type: 'string', description: 'Public URL after upload' },
          },
        },
      },
    },
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
    schema: {
      summary: 'Remove avatar',
      description: 'Removes the current user\'s avatar.',
      tags: ['Users'],
      response: {
        200: successResponse,
      },
    },
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
    schema: {
      summary: 'Get user public profile',
      description: 'Returns the public profile for another user.',
      tags: ['Users'],
      params: userIdParam,
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fullName: { type: 'string' },
            displayName: { type: 'string' },
            bio: { type: 'string' },
            avatarUrl: { type: 'string', nullable: true },
            timezone: { type: 'string' },
          },
        },
        404: errorResponse,
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string }

      const result = await getUserProfile(id)

      return reply.status(200).send(result)
    },
  })

  // PATCH /api/users/:id/role — Change user's org role
  app.patch('/:id/role', {
    schema: {
      summary: 'Change user role',
      description: 'Changes a user\'s organization role. Admin can assign basic/mid. Super admin can assign any role.',
      tags: ['Users'],
      params: userIdParam,
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['basic', 'mid', 'admin', 'super_admin'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            orgRole: { type: 'string' },
          },
        },
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Suspend user',
      description: 'Suspends a user account, preventing login. Admin or Super admin only.',
      tags: ['Users'],
      params: userIdParam,
      response: {
        200: successResponse,
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Unsuspend user',
      description: 'Restores a suspended user account. Admin or Super admin only.',
      tags: ['Users'],
      params: userIdParam,
      response: {
        200: successResponse,
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Deactivate user',
      description: 'Deactivates a user account. Admin or Super admin only.',
      tags: ['Users'],
      params: userIdParam,
      response: {
        200: successResponse,
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Reactivate user',
      description: 'Reactivates a deactivated user account. Super admin only.',
      tags: ['Users'],
      params: userIdParam,
      response: {
        200: successResponse,
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Force logout user',
      description: 'Terminates all active sessions for a user. Admin or Super admin only.',
      tags: ['Users'],
      params: userIdParam,
      response: {
        200: successResponse,
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'List user sessions',
      description: 'Returns all active sessions for a user. Admin or Super admin only.',
      tags: ['Users'],
      params: userIdParam,
      response: {
        200: {
          type: 'object',
          properties: {
            sessions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  ipAddress: { type: 'string' },
                  userAgent: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  lastSeenAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        403: errorResponse,
      },
    },
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
    schema: {
      summary: 'Unlock user account',
      description: 'Unlocks a user account that was locked due to too many failed login attempts.',
      tags: ['Users'],
      params: userIdParam,
      response: {
        200: successResponse,
        403: errorResponse,
      },
    },
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
