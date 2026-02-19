/**
 * Role authorization middleware.
 *
 * - requireRole: Checks org_role against a list of allowed roles.
 * - requireVenueRole: Checks venue-scoped role at a specific venue.
 * - requireChannelMembership: Checks the user is a member of a channel.
 * - requireDmMembership: Checks the user is a member of a DM.
 * - Utility functions for role hierarchy checks.
 */

import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { db, userVenues, channelMembers, dmMembers } from '@smoker/db'
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'

/**
 * Org-wide roles (from the org_role field on the users table).
 */
export type OrgRole = 'basic' | 'mid' | 'admin' | 'super_admin'

/**
 * Venue-scoped roles (from the venue_role field on the user_venues table).
 */
export type VenueRole = 'basic' | 'mid' | 'admin' | 'super_admin'

/**
 * Role hierarchy levels — higher number = more privileges.
 */
const ROLE_LEVELS: Record<string, number> = {
  basic: 0,
  mid: 1,
  admin: 2,
  super_admin: 3,
}

/**
 * Returns a preHandler that checks the authenticated user's org_role
 * is in the allowed list.
 *
 * Must be used AFTER the `authenticate` middleware.
 */
export function requireRole(...roles: OrgRole[]): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required', 'MISSING_TOKEN')
    }

    const userRole = request.user.orgRole as OrgRole

    if (!roles.includes(userRole)) {
      throw new ForbiddenError(
        `Requires one of: ${roles.join(', ')}`,
        'INSUFFICIENT_ROLE',
      )
    }
  }
}

/**
 * Returns a preHandler that extracts the venue ID from the request params,
 * looks up the user's role at that venue, and checks it's in the allowed list.
 *
 * Must be used AFTER the `authenticate` middleware.
 *
 * @param venueIdParam - The name of the route parameter containing the venue ID (e.g., 'venueId')
 * @param roles - Allowed venue-scoped roles
 */
export function requireVenueRole(
  venueIdParam: string,
  ...roles: VenueRole[]
): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required', 'MISSING_TOKEN')
    }

    const params = request.params as Record<string, string>
    const venueId = params[venueIdParam]

    if (!venueId) {
      throw new ForbiddenError('Venue ID is required', 'MISSING_VENUE_ID')
    }

    // Super admins bypass venue role checks
    if (isSuperAdmin(request.user)) {
      return
    }

    const [membership] = await db
      .select({ venueRole: userVenues.venueRole })
      .from(userVenues)
      .where(and(eq(userVenues.userId, request.user.id), eq(userVenues.venueId, venueId)))
      .limit(1)

    if (!membership) {
      throw new ForbiddenError('Not a member of this venue', 'NOT_VENUE_MEMBER')
    }

    if (!roles.includes(membership.venueRole as VenueRole)) {
      throw new ForbiddenError(
        `Requires venue role: ${roles.join(', ')}`,
        'INSUFFICIENT_VENUE_ROLE',
      )
    }
  }
}

/**
 * Returns a preHandler that checks the user is a member of the specified channel.
 *
 * Must be used AFTER the `authenticate` middleware.
 *
 * @param channelIdParam - The name of the route parameter containing the channel ID
 */
export function requireChannelMembership(channelIdParam: string): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required', 'MISSING_TOKEN')
    }

    const params = request.params as Record<string, string>
    const channelId = params[channelIdParam]

    if (!channelId) {
      throw new ForbiddenError('Channel ID is required', 'MISSING_CHANNEL_ID')
    }

    // Super admins and org admins can access any channel
    if (isAdminOrAbove(request.user)) {
      return
    }

    const [membership] = await db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(
        and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, request.user.id)),
      )
      .limit(1)

    if (!membership) {
      throw new ForbiddenError('Not a member of this channel', 'NOT_CHANNEL_MEMBER')
    }
  }
}

/**
 * Returns a preHandler that checks the user is a member of the specified DM.
 *
 * Exception: Super admin can access any DM (audit logged per spec Section 7.4).
 *
 * Must be used AFTER the `authenticate` middleware.
 *
 * @param dmIdParam - The name of the route parameter containing the DM ID
 */
export function requireDmMembership(dmIdParam: string): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required', 'MISSING_TOKEN')
    }

    const params = request.params as Record<string, string>
    const dmId = params[dmIdParam]

    if (!dmId) {
      throw new ForbiddenError('DM ID is required', 'MISSING_DM_ID')
    }

    // Super admins can access any DM, but it MUST be audit logged
    if (isSuperAdmin(request.user)) {
      await logAudit({
        actorId: request.user.id,
        actorType: 'user',
        action: 'dm.super_admin_access',
        targetType: 'dm',
        targetId: dmId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? 'unknown',
      })
      return
    }

    const [membership] = await db
      .select({ dmId: dmMembers.dmId })
      .from(dmMembers)
      .where(and(eq(dmMembers.dmId, dmId), eq(dmMembers.userId, request.user.id)))
      .limit(1)

    if (!membership) {
      throw new ForbiddenError('Not a member of this DM', 'NOT_DM_MEMBER')
    }
  }
}

/**
 * Check if a user has the super_admin org role.
 */
export function isSuperAdmin(user: { orgRole: string }): boolean {
  return user.orgRole === 'super_admin'
}

/**
 * Check if a user has admin or super_admin org role.
 */
export function isAdminOrAbove(user: { orgRole: string }): boolean {
  return user.orgRole === 'admin' || user.orgRole === 'super_admin'
}

/**
 * Check if the actor's role level can manage the target role level.
 * Per spec Section 5.2:
 * - Admin can assign: basic, mid
 * - Super admin can assign: basic, mid, admin, super_admin
 */
export function canManageRole(actorRole: OrgRole, targetRole: OrgRole): boolean {
  const actorLevel = ROLE_LEVELS[actorRole] ?? 0
  const targetLevel = ROLE_LEVELS[targetRole] ?? 0

  // Actor must be strictly above the target role
  return actorLevel > targetLevel
}
