/**
 * Channel service layer.
 *
 * Handles channel CRUD, membership management (add/remove/join/leave),
 * notification preferences, channel settings, and archiving.
 */

import { eq, and, desc, count, isNull, or, sql } from 'drizzle-orm'
import { db, channels, channelMembers, users, messages, deletedVault } from '@smoker/db'
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  channelArchivedError,
} from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'
import { isAdminOrAbove } from '../middleware/roles.js'
import { sha256 } from '../lib/crypto.js'
import { emitToChannel, emitToUser } from '../plugins/socket.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdminOrSuperAdmin(orgRole: string): boolean {
  return orgRole === 'admin' || orgRole === 'super_admin'
}

// ---------------------------------------------------------------------------
// 1. listChannels
// ---------------------------------------------------------------------------

export async function listChannels(
  userId: string,
  orgRole: string,
  options: {
    scope?: string
    venueId?: string
    cursor?: string
    limit?: number
  } = {},
) {
  const { scope, venueId, cursor, limit = 50 } = options
  const pageLimit = Math.min(limit, 100)

  // Build base conditions
  const conditions = [eq(channels.status, 'active')]

  if (scope) {
    conditions.push(eq(channels.scope, scope))
  }

  if (venueId) {
    conditions.push(eq(channels.venueId, venueId))
  }

  if (cursor) {
    conditions.push(sql`${channels.createdAt} < ${cursor}`)
  }

  if (isAdminOrSuperAdmin(orgRole)) {
    // Admin/super_admin can see all channels
    const rows = await db
      .select({
        id: channels.id,
        name: channels.name,
        type: channels.type,
        scope: channels.scope,
        venueId: channels.venueId,
        isDefault: channels.isDefault,
        isMandatory: channels.isMandatory,
        status: channels.status,
        memberCount: count(channelMembers.userId),
        createdAt: channels.createdAt,
      })
      .from(channels)
      .leftJoin(channelMembers, eq(channels.id, channelMembers.channelId))
      .where(and(...conditions))
      .groupBy(channels.id)
      .orderBy(desc(channels.createdAt))
      .limit(pageLimit + 1)

    const hasMore = rows.length > pageLimit
    const results = hasMore ? rows.slice(0, pageLimit) : rows

    return {
      channels: results.map((r) => ({ ...r, memberCount: Number(r.memberCount) })),
      nextCursor: hasMore ? results[results.length - 1]?.createdAt?.toISOString() : null,
    }
  }

  // Non-admin: public channels visible to all, private only if member
  const rows = await db
    .select({
      id: channels.id,
      name: channels.name,
      type: channels.type,
      scope: channels.scope,
      venueId: channels.venueId,
      isDefault: channels.isDefault,
      isMandatory: channels.isMandatory,
      status: channels.status,
      memberCount: sql<number>`(
        SELECT count(*)::int FROM channel_members cm
        WHERE cm.channel_id = ${channels.id}
      )`,
      createdAt: channels.createdAt,
    })
    .from(channels)
    .leftJoin(
      channelMembers,
      and(eq(channels.id, channelMembers.channelId), eq(channelMembers.userId, userId)),
    )
    .where(
      and(
        ...conditions,
        or(eq(channels.type, 'public'), sql`${channelMembers.userId} IS NOT NULL`),
      ),
    )
    .orderBy(desc(channels.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const results = hasMore ? rows.slice(0, pageLimit) : rows

  return {
    channels: results.map((r) => ({ ...r, memberCount: Number(r.memberCount) })),
    nextCursor: hasMore ? results[results.length - 1]?.createdAt?.toISOString() : null,
  }
}

// ---------------------------------------------------------------------------
// 2. createChannel
// ---------------------------------------------------------------------------

export async function createChannel(
  data: {
    name: string
    type: string
    scope: string
    venueId?: string
    topic?: string
    description?: string
  },
  userId: string,
  ipAddress: string,
  userAgent: string,
) {
  if (data.scope === 'venue' && !data.venueId) {
    throw new ValidationError(
      'venueId is required for venue-scoped channels',
      'VENUE_ID_REQUIRED',
    )
  }

  const [channel] = await db
    .insert(channels)
    .values({
      name: data.name,
      type: data.type,
      scope: data.scope,
      venueId: data.venueId ?? null,
      topic: data.topic ?? null,
      description: data.description ?? null,
      ownerUserId: userId,
    })
    .returning()

  if (!channel) {
    throw new Error('Failed to create channel')
  }

  // Add creator as first member
  await db.insert(channelMembers).values({
    channelId: channel.id,
    userId,
  })

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'channel.created',
    targetType: 'channel',
    targetId: channel.id,
    metadata: { name: data.name, type: data.type, scope: data.scope },
    ipAddress,
    userAgent,
  })

  emitToUser(userId, 'channel:created', channel)

  return channel
}

// ---------------------------------------------------------------------------
// 3. getChannelById
// ---------------------------------------------------------------------------

export async function getChannelById(channelId: string) {
  const rows = await db
    .select({
      id: channels.id,
      name: channels.name,
      topic: channels.topic,
      description: channels.description,
      type: channels.type,
      scope: channels.scope,
      venueId: channels.venueId,
      ownerUserId: channels.ownerUserId,
      isDefault: channels.isDefault,
      isMandatory: channels.isMandatory,
      status: channels.status,
      createdAt: channels.createdAt,
      updatedAt: channels.updatedAt,
      memberCount: count(channelMembers.userId),
    })
    .from(channels)
    .leftJoin(channelMembers, eq(channels.id, channelMembers.channelId))
    .where(eq(channels.id, channelId))
    .groupBy(channels.id)

  const channel = rows[0]

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  return { ...channel, memberCount: Number(channel.memberCount) }
}

// ---------------------------------------------------------------------------
// 4. updateChannel
// ---------------------------------------------------------------------------

export async function updateChannel(
  channelId: string,
  data: { name?: string; topic?: string; description?: string },
  userId: string,
  orgRole: string,
  ipAddress: string,
  userAgent: string,
) {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  // Check: user is channel owner, or admin/super_admin
  if (channel.ownerUserId !== userId && !isAdminOrSuperAdmin(orgRole)) {
    throw new ForbiddenError('Only channel owner or admin can update', 'INSUFFICIENT_ROLE')
  }

  if (channel.status === 'archived') {
    throw channelArchivedError()
  }

  const [updated] = await db
    .update(channels)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(channels.id, channelId))
    .returning()

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action: 'channel.updated',
    targetType: 'channel',
    targetId: channelId,
    metadata: { changes: data },
    ipAddress,
    userAgent,
  })

  emitToChannel(channelId, 'channel:updated', { channelId, ...data })

  return updated
}

// ---------------------------------------------------------------------------
// 5. archiveChannel
// ---------------------------------------------------------------------------

export async function archiveChannel(
  channelId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  await db
    .update(channels)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(channels.id, channelId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'channel.archived',
    targetType: 'channel',
    targetId: channelId,
    metadata: { name: channel.name },
    ipAddress,
    userAgent,
  })

  emitToChannel(channelId, 'channel:archived', { channelId })
}

// ---------------------------------------------------------------------------
// 6. unarchiveChannel
// ---------------------------------------------------------------------------

export async function unarchiveChannel(
  channelId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  await db
    .update(channels)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(channels.id, channelId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'channel.unarchived',
    targetType: 'channel',
    targetId: channelId,
    metadata: { name: channel.name },
    ipAddress,
    userAgent,
  })

  emitToChannel(channelId, 'channel:unarchived', { channelId })
}

// ---------------------------------------------------------------------------
// 7. deleteChannel
// ---------------------------------------------------------------------------

export async function deleteChannel(
  channelId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  const purgeAfter = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) // 180 days
  const batchSize = 500
  let totalArchived = 0

  await db.transaction(async (tx) => {
    // Move channel messages to deletedVault in batches
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const batch = await tx
        .select({
          id: messages.id,
          channelId: messages.channelId,
          userId: messages.userId,
          parentMessageId: messages.parentMessageId,
          body: messages.body,
          createdAt: messages.createdAt,
          updatedAt: messages.updatedAt,
        })
        .from(messages)
        .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
        .limit(batchSize)
        .offset(offset)

      if (batch.length === 0) {
        hasMore = false
        break
      }

      // Batch insert into vault
      await tx.insert(deletedVault).values(
        batch.map((msg) => {
          const content = {
            id: msg.id,
            channelId: msg.channelId,
            userId: msg.userId,
            parentMessageId: msg.parentMessageId,
            body: msg.body,
            createdAt: msg.createdAt,
            updatedAt: msg.updatedAt,
          }
          return {
            originalType: 'message' as const,
            originalId: msg.id,
            content,
            contentHash: sha256(JSON.stringify(content)),
            deletedBy: actorId,
            purgeAfter,
          }
        }),
      )

      totalArchived += batch.length
      offset += batchSize

      if (batch.length < batchSize) {
        hasMore = false
      }
    }

    // Soft-delete: set status to 'deleted'
    await tx
      .update(channels)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(channels.id, channelId))

    await logAudit({
      actorId,
      actorType: 'user',
      action: 'channel.deleted',
      targetType: 'channel',
      targetId: channelId,
      metadata: { name: channel.name, messageCount: totalArchived },
      ipAddress,
      userAgent,
    })
  })

  emitToChannel(channelId, 'channel:deleted', { channelId })
}

// ---------------------------------------------------------------------------
// 8. listChannelMembers
// ---------------------------------------------------------------------------

export async function listChannelMembers(channelId: string) {
  return db
    .select({
      userId: channelMembers.userId,
      fullName: users.fullName,
      orgRole: users.orgRole,
      notificationPref: channelMembers.notificationPref,
      joinedAt: channelMembers.joinedAt,
    })
    .from(channelMembers)
    .innerJoin(users, eq(channelMembers.userId, users.id))
    .where(eq(channelMembers.channelId, channelId))
}

// ---------------------------------------------------------------------------
// 9. addChannelMembers
// ---------------------------------------------------------------------------

export async function addChannelMembers(
  channelId: string,
  userIds: string[],
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  if (channel.status === 'archived') {
    throw channelArchivedError()
  }

  for (const uid of userIds) {
    await db
      .insert(channelMembers)
      .values({
        channelId,
        userId: uid,
      })
      .onConflictDoNothing()
  }

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'channel.members_added',
    targetType: 'channel',
    targetId: channelId,
    metadata: { userIds },
    ipAddress,
    userAgent,
  })

  for (const uid of userIds) {
    emitToChannel(channelId, 'channel:member_added', { userId: uid, channelId })
  }
}

// ---------------------------------------------------------------------------
// 10. removeChannelMember
// ---------------------------------------------------------------------------

export async function removeChannelMember(
  channelId: string,
  userId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  if (channel.isMandatory) {
    throw new ForbiddenError('Cannot remove from mandatory channel', 'MANDATORY_CHANNEL')
  }

  await db
    .delete(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'channel.member_removed',
    targetType: 'channel',
    targetId: channelId,
    metadata: { userId },
    ipAddress,
    userAgent,
  })

  emitToChannel(channelId, 'channel:member_removed', { userId, channelId })
  emitToUser(userId, 'channel:member_removed', { userId, channelId })
}

// ---------------------------------------------------------------------------
// 11. leaveChannel
// ---------------------------------------------------------------------------

export async function leaveChannel(channelId: string, userId: string): Promise<void> {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  if (channel.isMandatory) {
    throw new ForbiddenError('Cannot leave mandatory channel', 'MANDATORY_CHANNEL')
  }

  await db
    .delete(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))

  emitToChannel(channelId, 'channel:member_left', { userId, channelId })
}

// ---------------------------------------------------------------------------
// 12. joinChannel
// ---------------------------------------------------------------------------

export async function joinChannel(channelId: string, userId: string): Promise<void> {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  if (channel.status !== 'active') {
    throw new ForbiddenError('Channel is not active', 'CHANNEL_NOT_ACTIVE')
  }

  if (channel.type !== 'public') {
    throw new ForbiddenError('Cannot join private channel directly', 'PRIVATE_CHANNEL')
  }

  await db
    .insert(channelMembers)
    .values({
      channelId,
      userId,
    })
    .onConflictDoNothing()

  emitToChannel(channelId, 'channel:member_joined', { userId, channelId })
}

// ---------------------------------------------------------------------------
// 13. updateNotificationPref
// ---------------------------------------------------------------------------

export async function updateNotificationPref(
  channelId: string,
  userId: string,
  pref: string,
): Promise<void> {
  await db
    .update(channelMembers)
    .set({ notificationPref: pref })
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId)))
}

// ---------------------------------------------------------------------------
// 14. updateChannelSettings
// ---------------------------------------------------------------------------

export async function updateChannelSettings(
  channelId: string,
  data: { isDefault?: boolean; isMandatory?: boolean },
  actorId: string,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) {
    throw new NotFoundError('Channel not found', 'CHANNEL_NOT_FOUND')
  }

  await db
    .update(channels)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(channels.id, channelId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'channel.settings_updated',
    targetType: 'channel',
    targetId: channelId,
    metadata: { changes: data },
    ipAddress,
    userAgent,
  })
}

// ---------------------------------------------------------------------------
// 15. pinMessage — TODO: Schema does not have pinnedAt/pinnedBy on messages
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function pinMessage(
  _channelId: string,
  _messageId: string,
  _userId: string,
  _orgRole: string,
): Promise<never> {
  // TODO: Implement once pinned_messages table or pinnedAt/pinnedBy columns are added
  throw new Error('Not implemented: pin message requires schema changes')
}

// ---------------------------------------------------------------------------
// 16. unpinMessage — TODO
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function unpinMessage(_channelId: string, _messageId: string): Promise<never> {
  // TODO: Implement once pinned_messages table or pinnedAt/pinnedBy columns are added
  throw new Error('Not implemented: unpin message requires schema changes')
}

// ---------------------------------------------------------------------------
// 17. listPinnedMessages — TODO
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function listPinnedMessages(_channelId: string): Promise<never> {
  // TODO: Implement once pinned_messages table or pinnedAt/pinnedBy columns are added
  throw new Error('Not implemented: list pinned messages requires schema changes')
}
