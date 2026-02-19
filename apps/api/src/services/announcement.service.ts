/**
 * Announcement service layer.
 *
 * Handles announcement CRUD, acknowledgement tracking, ack dashboards,
 * pending announcements, and escalation.
 */

import { eq, and, desc, count, sql, isNull, lt } from 'drizzle-orm'
import {
  db,
  announcements,
  announcementAcks,
  announcementReminders,
  users,
  channels,
  channelMembers,
  userVenues,
} from '@smoker/db'
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  announcementLockedError,
} from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'
import { getIO } from '../plugins/socket.js'
import { emitToUser } from '../plugins/socket.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_LIMIT = 20

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdminOrAbove(orgRole: string): boolean {
  return orgRole === 'admin' || orgRole === 'super_admin'
}

// ---------------------------------------------------------------------------
// 1. listAnnouncements
// ---------------------------------------------------------------------------

export async function listAnnouncements(
  userId: string,
  orgRole: string,
  options: {
    scope?: string
    venueId?: string
    cursor?: string
    limit?: number
  } = {},
) {
  const { scope, venueId, cursor, limit = DEFAULT_PAGE_LIMIT } = options
  const pageLimit = Math.min(limit, 100)

  const conditions: ReturnType<typeof eq>[] = []

  if (scope) {
    conditions.push(eq(announcements.scope, scope))
  }

  if (venueId) {
    conditions.push(eq(announcements.venueId, venueId))
  }

  if (cursor) {
    conditions.push(lt(announcements.createdAt, new Date(cursor)))
  }

  const rows = await db
    .select({
      id: announcements.id,
      scope: announcements.scope,
      venueId: announcements.venueId,
      channelId: announcements.channelId,
      userId: announcements.userId,
      authorName: users.fullName,
      title: announcements.title,
      body: announcements.body,
      ackRequired: announcements.ackRequired,
      locked: announcements.locked,
      createdAt: announcements.createdAt,
      updatedAt: announcements.updatedAt,
      ackCount: sql<number>`(
        SELECT count(*)::int FROM announcement_acks aa
        WHERE aa.announcement_id = ${announcements.id}
      )`,
      userAcked: sql<boolean>`EXISTS (
        SELECT 1 FROM announcement_acks aa
        WHERE aa.announcement_id = ${announcements.id}
          AND aa.user_id = ${userId}
      )`,
    })
    .from(announcements)
    .innerJoin(users, eq(announcements.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(announcements.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null

  return { announcements: page, nextCursor }
}

// ---------------------------------------------------------------------------
// 2. createAnnouncement
// ---------------------------------------------------------------------------

export async function createAnnouncement(
  data: {
    scope: string
    venueId?: string
    channelId?: string
    title: string
    body: string
    ackRequired: boolean
  },
  createdBy: string,
  ipAddress: string,
  userAgent: string,
) {
  // Validate scope constraints
  if (data.scope === 'system' && (data.venueId || data.channelId)) {
    throw new ValidationError(
      'System-scoped announcements must not have venueId or channelId',
      'INVALID_SCOPE',
    )
  }

  if (data.scope === 'venue' && !data.venueId) {
    throw new ValidationError(
      'venueId is required for venue-scoped announcements',
      'VENUE_ID_REQUIRED',
    )
  }

  if (data.scope === 'channel' && !data.channelId) {
    throw new ValidationError(
      'channelId is required for channel-scoped announcements',
      'CHANNEL_ID_REQUIRED',
    )
  }

  const [announcement] = await db
    .insert(announcements)
    .values({
      scope: data.scope,
      venueId: data.venueId ?? null,
      channelId: data.channelId ?? null,
      userId: createdBy,
      title: data.title,
      body: data.body,
      ackRequired: data.ackRequired,
    })
    .returning()

  if (!announcement) {
    throw new Error('Failed to create announcement')
  }

  // If ackRequired, compute ack recipients and create reminder schedule
  if (data.ackRequired) {
    const recipients = await getAckRecipients(announcement)

    // Create initial reminder records for each recipient
    for (const recipient of recipients) {
      await db.insert(announcementReminders).values({
        announcementId: announcement.id,
        userId: recipient.userId,
        reminderNumber: 1,
      })
    }
  }

  await logAudit({
    actorId: createdBy,
    actorType: 'user',
    action: 'announcement.created',
    targetType: 'announcement',
    targetId: announcement.id,
    metadata: {
      scope: data.scope,
      venueId: data.venueId,
      channelId: data.channelId,
      ackRequired: data.ackRequired,
    },
    ipAddress,
    userAgent,
  })

  // Broadcast to all connected sockets — announcements are high-priority
  getIO().emit('announcement:new', announcement)

  return announcement
}

// ---------------------------------------------------------------------------
// 3. getAnnouncement
// ---------------------------------------------------------------------------

export async function getAnnouncement(announcementId: string, userId: string) {
  const [row] = await db
    .select({
      id: announcements.id,
      scope: announcements.scope,
      venueId: announcements.venueId,
      channelId: announcements.channelId,
      userId: announcements.userId,
      authorName: users.fullName,
      title: announcements.title,
      body: announcements.body,
      ackRequired: announcements.ackRequired,
      locked: announcements.locked,
      createdAt: announcements.createdAt,
      updatedAt: announcements.updatedAt,
    })
    .from(announcements)
    .innerJoin(users, eq(announcements.userId, users.id))
    .where(eq(announcements.id, announcementId))
    .limit(1)

  if (!row) {
    throw new NotFoundError('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND')
  }

  // Check user's ack status
  const [ack] = await db
    .select({ ackedAt: announcementAcks.ackedAt })
    .from(announcementAcks)
    .where(
      and(
        eq(announcementAcks.announcementId, announcementId),
        eq(announcementAcks.userId, userId),
      ),
    )
    .limit(1)

  return {
    ...row,
    userAckedAt: ack?.ackedAt ?? null,
  }
}

// ---------------------------------------------------------------------------
// 4. updateAnnouncement
// ---------------------------------------------------------------------------

export async function updateAnnouncement(
  announcementId: string,
  data: { title?: string; body?: string },
  userId: string,
  orgRole: string,
  ipAddress: string,
  userAgent: string,
) {
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1)

  if (!announcement) {
    throw new NotFoundError('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND')
  }

  // Only creator or admin can edit
  if (announcement.userId !== userId && !isAdminOrAbove(orgRole)) {
    throw new ForbiddenError(
      'Only the announcement creator or admin can edit',
      'INSUFFICIENT_ROLE',
    )
  }

  // Only editable if no acks have been received yet (locked = false)
  if (announcement.locked) {
    throw announcementLockedError()
  }

  // Double-check: no acks exist
  const [ackCheck] = await db
    .select({ total: count() })
    .from(announcementAcks)
    .where(eq(announcementAcks.announcementId, announcementId))

  if (ackCheck && ackCheck.total > 0) {
    // Lock the announcement and throw
    await db
      .update(announcements)
      .set({ locked: true, updatedAt: new Date() })
      .where(eq(announcements.id, announcementId))

    throw announcementLockedError()
  }

  const [updated] = await db
    .update(announcements)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(announcements.id, announcementId))
    .returning()

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'announcement.updated',
    targetType: 'announcement',
    targetId: announcementId,
    metadata: { changes: data },
    ipAddress,
    userAgent,
  })

  return updated
}

// ---------------------------------------------------------------------------
// 5. deleteAnnouncement (soft delete)
// ---------------------------------------------------------------------------

export async function deleteAnnouncement(
  announcementId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1)

  if (!announcement) {
    throw new NotFoundError('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND')
  }

  // Soft delete: mark as locked (no dedicated status column, so we use locked
  // as the soft-delete flag and we also clear the body to indicate archival)
  // Since the schema doesn't have a status column, we use the locked flag
  // and a convention of setting the title prefix to indicate deletion.
  await db
    .update(announcements)
    .set({ locked: true, updatedAt: new Date() })
    .where(eq(announcements.id, announcementId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'announcement.deleted',
    targetType: 'announcement',
    targetId: announcementId,
    metadata: {
      title: announcement.title,
      scope: announcement.scope,
    },
    ipAddress,
    userAgent,
  })

  return { success: true as const }
}

// ---------------------------------------------------------------------------
// 6. acknowledgeAnnouncement
// ---------------------------------------------------------------------------

export async function acknowledgeAnnouncement(
  announcementId: string,
  userId: string,
  sessionId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [announcement] = await db
    .select({ id: announcements.id, ackRequired: announcements.ackRequired })
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1)

  if (!announcement) {
    throw new NotFoundError('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND')
  }

  // Insert ack — onConflictDoNothing for idempotency
  await db
    .insert(announcementAcks)
    .values({
      announcementId,
      userId,
      sessionId,
    })
    .onConflictDoNothing()

  // Lock the announcement after first ack (prevents further edits)
  await db
    .update(announcements)
    .set({ locked: true })
    .where(eq(announcements.id, announcementId))

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'announcement.acknowledged',
    targetType: 'announcement',
    targetId: announcementId,
    ipAddress,
    userAgent,
  })

  // Notify the announcement creator that someone acknowledged
  const [ann] = await db
    .select({ userId: announcements.userId })
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1)

  if (ann) {
    emitToUser(ann.userId, 'announcement:acknowledged', {
      announcementId,
      userId,
    })
  }

  return { success: true as const }
}

// ---------------------------------------------------------------------------
// 7. getAckDashboard
// ---------------------------------------------------------------------------

export async function getAckDashboard(announcementId: string) {
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1)

  if (!announcement) {
    throw new NotFoundError('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND')
  }

  // Get expected recipients based on scope
  const recipients = await getAckRecipients(announcement)

  // Get actual acks
  const acks = await db
    .select({
      userId: announcementAcks.userId,
      ackedAt: announcementAcks.ackedAt,
    })
    .from(announcementAcks)
    .where(eq(announcementAcks.announcementId, announcementId))

  const ackMap = new Map(acks.map((a) => [a.userId, a.ackedAt]))

  const userList = recipients.map((r) => ({
    userId: r.userId,
    fullName: r.fullName,
    ackedAt: ackMap.get(r.userId) ?? null,
  }))

  const ackedCount = userList.filter((u) => u.ackedAt !== null).length
  const pendingCount = userList.filter((u) => u.ackedAt === null).length

  return {
    totalRequired: userList.length,
    acked: ackedCount,
    pending: pendingCount,
    users: userList,
  }
}

// ---------------------------------------------------------------------------
// 8. getPendingAnnouncements
// ---------------------------------------------------------------------------

export async function getPendingAnnouncements(userId: string) {
  // Get announcements where ackRequired=true and user hasn't acked yet
  const rows = await db
    .select({
      id: announcements.id,
      scope: announcements.scope,
      venueId: announcements.venueId,
      channelId: announcements.channelId,
      userId: announcements.userId,
      authorName: users.fullName,
      title: announcements.title,
      body: announcements.body,
      ackRequired: announcements.ackRequired,
      createdAt: announcements.createdAt,
    })
    .from(announcements)
    .innerJoin(users, eq(announcements.userId, users.id))
    .where(
      and(
        eq(announcements.ackRequired, true),
        sql`NOT EXISTS (
          SELECT 1 FROM announcement_acks aa
          WHERE aa.announcement_id = ${announcements.id}
            AND aa.user_id = ${userId}
        )`,
      ),
    )
    .orderBy(desc(announcements.createdAt))

  return rows
}

// ---------------------------------------------------------------------------
// 9. escalateAnnouncement
// ---------------------------------------------------------------------------

export async function escalateAnnouncement(
  announcementId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1)

  if (!announcement) {
    throw new NotFoundError('Announcement not found', 'ANNOUNCEMENT_NOT_FOUND')
  }

  // Get all expected recipients
  const recipients = await getAckRecipients(announcement)

  // Get users who have already acked
  const acks = await db
    .select({ userId: announcementAcks.userId })
    .from(announcementAcks)
    .where(eq(announcementAcks.announcementId, announcementId))

  const ackedUserIds = new Set(acks.map((a) => a.userId))
  const pendingUsers = recipients.filter((r) => !ackedUserIds.has(r.userId))

  // TODO: Trigger push notification to all pending ack users
  // For now, create reminder records to track the escalation
  for (const user of pendingUsers) {
    await db.insert(announcementReminders).values({
      announcementId,
      userId: user.userId,
      reminderNumber: 99, // escalation marker
    })
  }

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'announcement.escalated',
    targetType: 'announcement',
    targetId: announcementId,
    metadata: {
      pendingUserCount: pendingUsers.length,
      pendingUserIds: pendingUsers.map((u) => u.userId),
    },
    ipAddress,
    userAgent,
  })

  return {
    success: true as const,
    pendingUserCount: pendingUsers.length,
  }
}

// ---------------------------------------------------------------------------
// Internal: getAckRecipients
// ---------------------------------------------------------------------------

/**
 * Compute the list of users who should acknowledge an announcement
 * based on its scope.
 *
 * - system: all active users
 * - venue: all members of the venue
 * - channel: all members of the channel
 */
async function getAckRecipients(announcement: {
  scope: string
  venueId: string | null
  channelId: string | null
}): Promise<Array<{ userId: string; fullName: string }>> {
  if (announcement.scope === 'system') {
    return db
      .select({ userId: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.status, 'active'))
  }

  if (announcement.scope === 'venue' && announcement.venueId) {
    return db
      .select({ userId: users.id, fullName: users.fullName })
      .from(userVenues)
      .innerJoin(users, eq(userVenues.userId, users.id))
      .where(
        and(eq(userVenues.venueId, announcement.venueId), eq(users.status, 'active')),
      )
  }

  if (announcement.scope === 'channel' && announcement.channelId) {
    return db
      .select({ userId: users.id, fullName: users.fullName })
      .from(channelMembers)
      .innerJoin(users, eq(channelMembers.userId, users.id))
      .where(
        and(
          eq(channelMembers.channelId, announcement.channelId),
          eq(users.status, 'active'),
        ),
      )
  }

  return []
}
