/**
 * Onboarding service layer.
 *
 * Handles profile completion after invite acceptance: checking onboarding
 * status, completing the profile, listing positions and venues, and
 * auto-joining default channels.
 */

import { eq, and, isNull } from 'drizzle-orm'
import {
  db,
  users,
  positions,
  venues,
  userVenues,
  channels,
  channelMembers,
} from '@smoker/db'
import { logAudit } from '../lib/audit.js'
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors.js'

// ---------------------------------------------------------------------------
// 1. getOnboardingStatus
// ---------------------------------------------------------------------------

export async function getOnboardingStatus(userId: string): Promise<{
  completed: boolean
  profileCompletedAt: Date | null
  missingFields: string[]
  hasVenue: boolean
}> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

  if (!user) {
    throw new NotFoundError('User not found')
  }

  // Determine which required fields are still missing
  const missingFields: string[] = []
  if (!user.email) missingFields.push('email')
  if (!user.address) missingFields.push('address')
  if (!user.positionId) missingFields.push('positionId')

  // Check whether the user belongs to at least one venue
  const [venueRow] = await db
    .select({ venueId: userVenues.venueId })
    .from(userVenues)
    .where(eq(userVenues.userId, userId))
    .limit(1)

  const hasVenue = !!venueRow

  return {
    completed: !!user.profileCompletedAt,
    profileCompletedAt: user.profileCompletedAt,
    missingFields,
    hasVenue,
  }
}

// ---------------------------------------------------------------------------
// 2. completeOnboarding
// ---------------------------------------------------------------------------

export async function completeOnboarding(
  userId: string,
  data: {
    fullName: string
    email: string
    address: string
    positionId: string
    timezone: string
    venueId?: string
  },
  ipAddress: string,
  userAgent: string,
): Promise<typeof users.$inferSelect> {
  // Find user
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

  if (!user) {
    throw new NotFoundError('User not found')
  }

  // Guard: onboarding must not already be completed
  if (user.profileCompletedAt) {
    throw new ConflictError('Onboarding already completed')
  }

  // Validate positionId exists
  const [position] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, data.positionId))
    .limit(1)

  if (!position) {
    throw new ValidationError('Invalid position ID', 'VALIDATION_ERROR', {
      fields: { positionId: ['Position not found'] },
    })
  }

  // If venueId provided, validate venue exists and is active
  if (data.venueId) {
    const [venue] = await db
      .select()
      .from(venues)
      .where(and(eq(venues.id, data.venueId), eq(venues.status, 'active')))
      .limit(1)

    if (!venue) {
      throw new ValidationError('Invalid venue ID', 'VALIDATION_ERROR', {
        fields: { venueId: ['Venue not found or inactive'] },
      })
    }
  }

  // Update user profile
  const now = new Date()

  const [updatedUser] = await db
    .update(users)
    .set({
      fullName: data.fullName,
      email: data.email,
      address: data.address,
      positionId: data.positionId,
      timezone: data.timezone,
      profileCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId))
    .returning()

  // If venueId provided and user not already a member, join venue + default channels
  if (data.venueId) {
    const [existingMembership] = await db
      .select()
      .from(userVenues)
      .where(and(eq(userVenues.userId, userId), eq(userVenues.venueId, data.venueId)))
      .limit(1)

    if (!existingMembership) {
      // Join the venue
      await db.insert(userVenues).values({
        userId,
        venueId: data.venueId,
        venueRole: 'basic',
      })

      // Auto-join all default channels for this venue
      const venueDefaultChannels = await db
        .select()
        .from(channels)
        .where(
          and(
            eq(channels.venueId, data.venueId),
            eq(channels.isDefault, true),
            eq(channels.status, 'active'),
          ),
        )

      if (venueDefaultChannels.length > 0) {
        await db.insert(channelMembers).values(
          venueDefaultChannels.map((ch) => ({
            channelId: ch.id,
            userId,
          })),
        )
      }
    }
  }

  // Auto-join all org-wide default channels the user is not already in
  const orgDefaultChannels = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.scope, 'org'),
        eq(channels.isDefault, true),
        eq(channels.status, 'active'),
      ),
    )

  if (orgDefaultChannels.length > 0) {
    // Find which org-wide channels the user is already a member of
    const existingOrgMemberships = await db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(eq(channelMembers.userId, userId))

    const existingChannelIds = new Set(existingOrgMemberships.map((m) => m.channelId))

    const newOrgChannels = orgDefaultChannels.filter((ch) => !existingChannelIds.has(ch.id))

    if (newOrgChannels.length > 0) {
      await db.insert(channelMembers).values(
        newOrgChannels.map((ch) => ({
          channelId: ch.id,
          userId,
        })),
      )
    }
  }

  // Audit log
  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'user.onboarding_completed',
    targetType: 'user',
    targetId: userId,
    metadata: {
      positionId: data.positionId,
      venueId: data.venueId ?? null,
    },
    ipAddress,
    userAgent,
  })

  return updatedUser!
}

// ---------------------------------------------------------------------------
// 3. listPositions
// ---------------------------------------------------------------------------

export async function listPositions() {
  return db.select().from(positions).orderBy(positions.name)
}

// ---------------------------------------------------------------------------
// 4. listVenuesForOnboarding
// ---------------------------------------------------------------------------

export async function listVenuesForOnboarding() {
  return db
    .select({
      id: venues.id,
      name: venues.name,
      address: venues.address,
    })
    .from(venues)
    .where(eq(venues.status, 'active'))
}
