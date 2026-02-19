/**
 * Venue service layer.
 *
 * Handles venue CRUD, membership management (add/remove/role changes),
 * venue-scoped channel listing, and position management.
 */

import { eq, and, desc, count, ne, sql } from 'drizzle-orm'
import { db, venues, userVenues, channels, channelMembers, positions, users } from '@smoker/db'
import { NotFoundError, ForbiddenError, ConflictError, venueArchivedError } from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'
import { canManageRole } from '../middleware/roles.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdminOrSuperAdmin(orgRole: string): boolean {
  return orgRole === 'admin' || orgRole === 'super_admin'
}

// ---------------------------------------------------------------------------
// 1. listVenues
// ---------------------------------------------------------------------------

export async function listVenues(
  userId: string,
  orgRole: string,
): Promise<
  { id: string; name: string; address: string | null; status: string; memberCount: number; createdAt: Date }[]
> {
  if (isAdminOrSuperAdmin(orgRole)) {
    const rows = await db
      .select({
        id: venues.id,
        name: venues.name,
        address: venues.address,
        status: venues.status,
        memberCount: count(userVenues.userId),
        createdAt: venues.createdAt,
      })
      .from(venues)
      .leftJoin(userVenues, eq(venues.id, userVenues.venueId))
      .groupBy(venues.id)
      .orderBy(desc(venues.createdAt))

    return rows.map((r) => ({ ...r, memberCount: Number(r.memberCount) }))
  }

  const rows = await db
    .select({
      id: venues.id,
      name: venues.name,
      address: venues.address,
      status: venues.status,
      memberCount: sql<number>`(SELECT count(*)::int FROM user_venues uv WHERE uv.venue_id = ${venues.id})`,
      createdAt: venues.createdAt,
    })
    .from(venues)
    .innerJoin(
      userVenues,
      and(eq(venues.id, userVenues.venueId), eq(userVenues.userId, userId)),
    )
    .orderBy(desc(venues.createdAt))

  return rows.map((r) => ({ ...r, memberCount: Number(r.memberCount) }))
}

// ---------------------------------------------------------------------------
// 2. createVenue
// ---------------------------------------------------------------------------

export async function createVenue(
  data: { name: string; address: string },
  createdBy: string,
  ipAddress: string,
  userAgent: string,
) {
  const venue = await db.transaction(async (tx) => {
    const [newVenue] = await tx
      .insert(venues)
      .values({
        name: data.name,
        address: data.address,
        createdBy,
      })
      .returning()

    if (!newVenue) {
      throw new Error('Failed to create venue')
    }

    // Auto-add creator as venue admin
    await tx.insert(userVenues).values({
      userId: createdBy,
      venueId: newVenue.id,
      venueRole: 'admin',
    })

    // Create 3 default channels for the venue
    const defaultChannels = [
      { name: 'general', isMandatory: true },
      { name: 'announcements', isMandatory: true },
      { name: 'random', isMandatory: false },
    ]

    for (const ch of defaultChannels) {
      const [channel] = await tx
        .insert(channels)
        .values({
          name: ch.name,
          scope: 'venue',
          venueId: newVenue.id,
          ownerUserId: createdBy,
          isDefault: true,
          isMandatory: ch.isMandatory,
        })
        .returning()

      if (channel) {
        await tx.insert(channelMembers).values({
          channelId: channel.id,
          userId: createdBy,
        })
      }
    }

    await logAudit({
      actorId: createdBy,
      actorType: 'user',
      action: 'venue.created',
      targetType: 'venue',
      targetId: newVenue.id,
      metadata: { name: data.name },
      ipAddress,
      userAgent,
    })

    return newVenue
  })

  return venue
}

// ---------------------------------------------------------------------------
// 3. getVenueById
// ---------------------------------------------------------------------------

export async function getVenueById(venueId: string, userId: string, orgRole: string) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1)

  if (!venue) {
    throw new NotFoundError('Venue not found', 'VENUE_NOT_FOUND')
  }

  // Non-admin users must be a member
  if (!isAdminOrSuperAdmin(orgRole)) {
    const [membership] = await db
      .select()
      .from(userVenues)
      .where(and(eq(userVenues.venueId, venueId), eq(userVenues.userId, userId)))
      .limit(1)

    if (!membership) {
      throw new NotFoundError('Venue not found', 'VENUE_NOT_FOUND')
    }
  }

  // Fetch member list
  const members = await db
    .select({
      userId: userVenues.userId,
      fullName: users.fullName,
      orgRole: users.orgRole,
      venueRole: userVenues.venueRole,
      joinedAt: userVenues.joinedAt,
    })
    .from(userVenues)
    .innerJoin(users, eq(userVenues.userId, users.id))
    .where(eq(userVenues.venueId, venueId))

  return { ...venue, members }
}

// ---------------------------------------------------------------------------
// 4. updateVenue
// ---------------------------------------------------------------------------

export async function updateVenue(
  venueId: string,
  data: { name?: string; address?: string },
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1)

  if (!venue) {
    throw new NotFoundError('Venue not found', 'VENUE_NOT_FOUND')
  }

  if (venue.status === 'archived') {
    throw venueArchivedError()
  }

  const [updated] = await db
    .update(venues)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(venues.id, venueId))
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'venue.updated',
    targetType: 'venue',
    targetId: venueId,
    metadata: { changes: data },
    ipAddress,
    userAgent,
  })

  return updated
}

// ---------------------------------------------------------------------------
// 5. archiveVenue
// ---------------------------------------------------------------------------

export async function archiveVenue(
  venueId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1)

  if (!venue) {
    throw new NotFoundError('Venue not found', 'VENUE_NOT_FOUND')
  }

  await db
    .update(venues)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(venues.id, venueId))

  // Archive all venue-scoped channels
  await db
    .update(channels)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(and(eq(channels.venueId, venueId), eq(channels.scope, 'venue')))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'venue.archived',
    targetType: 'venue',
    targetId: venueId,
    metadata: { name: venue.name },
    ipAddress,
    userAgent,
  })
}

// ---------------------------------------------------------------------------
// 6. unarchiveVenue
// ---------------------------------------------------------------------------

export async function unarchiveVenue(
  venueId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1)

  if (!venue) {
    throw new NotFoundError('Venue not found', 'VENUE_NOT_FOUND')
  }

  await db
    .update(venues)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(venues.id, venueId))

  // Restore all venue-scoped channels back to active
  await db
    .update(channels)
    .set({ status: 'active', updatedAt: new Date() })
    .where(and(eq(channels.venueId, venueId), eq(channels.scope, 'venue')))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'venue.unarchived',
    targetType: 'venue',
    targetId: venueId,
    metadata: { name: venue.name },
    ipAddress,
    userAgent,
  })
}

// ---------------------------------------------------------------------------
// 7. listVenueMembers
// ---------------------------------------------------------------------------

export async function listVenueMembers(
  venueId: string,
  cursor?: string,
  limit = 100,
) {
  const pageLimit = Math.min(limit, 100)

  const conditions = [eq(userVenues.venueId, venueId)]

  if (cursor) {
    conditions.push(sql`${userVenues.joinedAt} < ${cursor}`)
  }

  const rows = await db
    .select({
      userId: userVenues.userId,
      fullName: users.fullName,
      orgRole: users.orgRole,
      venueRole: userVenues.venueRole,
      joinedAt: userVenues.joinedAt,
    })
    .from(userVenues)
    .innerJoin(users, eq(userVenues.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(userVenues.joinedAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const results = hasMore ? rows.slice(0, pageLimit) : rows

  return {
    members: results,
    nextCursor: hasMore ? results[results.length - 1]?.joinedAt?.toISOString() : null,
  }
}

// ---------------------------------------------------------------------------
// 8. addVenueMember
// ---------------------------------------------------------------------------

export async function addVenueMember(
  venueId: string,
  userId: string,
  venueRole: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ success: true }> {
  // Check venue exists and is active
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1)

  if (!venue) {
    throw new NotFoundError('Venue not found', 'VENUE_NOT_FOUND')
  }

  if (venue.status === 'archived') {
    throw venueArchivedError()
  }

  // Check user exists
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND')
  }

  // Check not already a member
  const [existing] = await db
    .select()
    .from(userVenues)
    .where(and(eq(userVenues.venueId, venueId), eq(userVenues.userId, userId)))
    .limit(1)

  if (existing) {
    throw new ConflictError('User is already a member of this venue', 'ALREADY_MEMBER')
  }

  // Insert membership
  await db.insert(userVenues).values({
    userId,
    venueId,
    venueRole,
  })

  // Auto-join all default channels for this venue
  const defaultChannels = await db
    .select({ id: channels.id })
    .from(channels)
    .where(
      and(
        eq(channels.venueId, venueId),
        eq(channels.isDefault, true),
        eq(channels.status, 'active'),
      ),
    )

  for (const ch of defaultChannels) {
    await db.insert(channelMembers).values({
      channelId: ch.id,
      userId,
    })
  }

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'venue.member_added',
    targetType: 'venue',
    targetId: venueId,
    metadata: { userId, venueRole },
    ipAddress,
    userAgent,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 9. removeVenueMember
// ---------------------------------------------------------------------------

export async function removeVenueMember(
  venueId: string,
  userId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  // Check membership exists
  const [membership] = await db
    .select()
    .from(userVenues)
    .where(and(eq(userVenues.venueId, venueId), eq(userVenues.userId, userId)))
    .limit(1)

  if (!membership) {
    throw new NotFoundError('User is not a member of this venue', 'NOT_VENUE_MEMBER')
  }

  // Ensure user still belongs to at least one OTHER venue
  const [otherVenueCount] = await db
    .select({ total: count() })
    .from(userVenues)
    .where(and(eq(userVenues.userId, userId), ne(userVenues.venueId, venueId)))

  if (!otherVenueCount || otherVenueCount.total === 0) {
    throw new ForbiddenError('User must belong to at least one venue', 'LAST_VENUE_MEMBERSHIP')
  }

  // Remove from userVenues
  await db
    .delete(userVenues)
    .where(and(eq(userVenues.venueId, venueId), eq(userVenues.userId, userId)))

  // Remove from all venue-scoped channel memberships
  const venueChannels = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.venueId, venueId), eq(channels.scope, 'venue')))

  for (const ch of venueChannels) {
    await db
      .delete(channelMembers)
      .where(and(eq(channelMembers.channelId, ch.id), eq(channelMembers.userId, userId)))
  }

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'venue.member_removed',
    targetType: 'venue',
    targetId: venueId,
    metadata: { userId },
    ipAddress,
    userAgent,
  })
}

// ---------------------------------------------------------------------------
// 10. changeVenueRole
// ---------------------------------------------------------------------------

export async function changeVenueRole(
  venueId: string,
  userId: string,
  newRole: string,
  actorId: string,
  actorOrgRole: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  // Find membership
  const [membership] = await db
    .select()
    .from(userVenues)
    .where(and(eq(userVenues.venueId, venueId), eq(userVenues.userId, userId)))
    .limit(1)

  if (!membership) {
    throw new NotFoundError('User is not a member of this venue', 'NOT_VENUE_MEMBER')
  }

  // Determine the actor's effective role: use the higher of their venue role or org role
  const [actorMembership] = await db
    .select({ venueRole: userVenues.venueRole })
    .from(userVenues)
    .where(and(eq(userVenues.venueId, venueId), eq(userVenues.userId, actorId)))
    .limit(1)

  const actorVenueRole = actorMembership?.venueRole ?? 'basic'
  const effectiveRole =
    (actorOrgRole === 'super_admin' || actorOrgRole === 'admin') ? actorOrgRole : actorVenueRole

  if (!canManageRole(effectiveRole as 'basic' | 'mid' | 'admin' | 'super_admin', newRole as 'basic' | 'mid' | 'admin' | 'super_admin')) {
    throw new ForbiddenError('Insufficient permissions to assign this role', 'INSUFFICIENT_ROLE')
  }

  await db
    .update(userVenues)
    .set({ venueRole: newRole })
    .where(and(eq(userVenues.venueId, venueId), eq(userVenues.userId, userId)))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'venue.role_changed',
    targetType: 'venue',
    targetId: venueId,
    metadata: { userId, previousRole: membership.venueRole, newRole },
    ipAddress,
    userAgent,
  })
}

// ---------------------------------------------------------------------------
// 11. listVenueChannels
// ---------------------------------------------------------------------------

export async function listVenueChannels(venueId: string) {
  return db
    .select()
    .from(channels)
    .where(and(eq(channels.venueId, venueId), eq(channels.status, 'active')))
}

// ---------------------------------------------------------------------------
// 12. listPositions
// ---------------------------------------------------------------------------

export async function listPositions() {
  return db.select().from(positions).orderBy(positions.name)
}

// ---------------------------------------------------------------------------
// 13. createPosition
// ---------------------------------------------------------------------------

export async function createPosition(
  name: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  // Check unique name
  const [existing] = await db
    .select()
    .from(positions)
    .where(eq(positions.name, name))
    .limit(1)

  if (existing) {
    throw new ConflictError('Position name already exists', 'POSITION_NAME_EXISTS')
  }

  const [position] = await db.insert(positions).values({ name }).returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'position.created',
    targetType: 'position',
    targetId: position?.id,
    metadata: { name },
    ipAddress,
    userAgent,
  })

  return position
}

// ---------------------------------------------------------------------------
// 14. updatePosition
// ---------------------------------------------------------------------------

export async function updatePosition(
  positionId: string,
  name: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [position] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, positionId))
    .limit(1)

  if (!position) {
    throw new NotFoundError('Position not found', 'POSITION_NOT_FOUND')
  }

  // Check unique name
  const [existing] = await db
    .select()
    .from(positions)
    .where(and(eq(positions.name, name), ne(positions.id, positionId)))
    .limit(1)

  if (existing) {
    throw new ConflictError('Position name already exists', 'POSITION_NAME_EXISTS')
  }

  const [updated] = await db
    .update(positions)
    .set({ name })
    .where(eq(positions.id, positionId))
    .returning()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'position.updated',
    targetType: 'position',
    targetId: positionId,
    metadata: { previousName: position.name, newName: name },
    ipAddress,
    userAgent,
  })

  return updated
}

// ---------------------------------------------------------------------------
// 15. deletePosition
// ---------------------------------------------------------------------------

export async function deletePosition(
  positionId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  const [position] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, positionId))
    .limit(1)

  if (!position) {
    throw new NotFoundError('Position not found', 'POSITION_NOT_FOUND')
  }

  // Check no users have this position
  const [usageCount] = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.positionId, positionId))

  if (usageCount && usageCount.total > 0) {
    throw new ConflictError('Position is in use', 'POSITION_IN_USE')
  }

  await db.delete(positions).where(eq(positions.id, positionId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'position.deleted',
    targetType: 'position',
    targetId: positionId,
    metadata: { name: position.name },
    ipAddress,
    userAgent,
  })
}
