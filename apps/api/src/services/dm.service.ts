/**
 * DM service layer.
 *
 * Handles DM CRUD, membership management (add/remove/leave),
 * dissolution, and message retrieval for direct and group DMs.
 */

import { eq, and, desc, count, isNull, inArray, lt } from 'drizzle-orm'
import { db, dms, dmMembers, users, messages } from '@smoker/db'
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'
import { MAX_GROUP_DM_MEMBERS } from '@smoker/shared'
import { emitToDm, emitToUser } from '../plugins/socket.js'

// ---------------------------------------------------------------------------
// 1. listDms
// ---------------------------------------------------------------------------

export async function listDms(userId: string, cursor?: string, limit: number = 25) {
  const effectiveLimit = Math.min(limit, 100)

  const conditions = [eq(dmMembers.userId, userId)]

  if (cursor) {
    conditions.push(lt(dms.createdAt, new Date(cursor)))
  }

  const baseRows = await db
    .select({
      id: dms.id,
      type: dms.type,
      createdAt: dms.createdAt,
      dissolvedAt: dms.dissolvedAt,
    })
    .from(dms)
    .innerJoin(dmMembers, eq(dms.id, dmMembers.dmId))
    .where(and(...conditions))
    .orderBy(desc(dms.createdAt))
    .limit(effectiveLimit + 1)

  const hasMore = baseRows.length > effectiveLimit
  const rows = hasMore ? baseRows.slice(0, effectiveLimit) : baseRows

  // Fetch members and last message for each DM
  const dmList = await Promise.all(
    rows.map(async (dm) => {
      const members = await db
        .select({
          userId: dmMembers.userId,
          fullName: users.fullName,
        })
        .from(dmMembers)
        .innerJoin(users, eq(dmMembers.userId, users.id))
        .where(eq(dmMembers.dmId, dm.id))

      const [lastMessage] = await db
        .select({
          body: messages.body,
          createdAt: messages.createdAt,
          userId: messages.userId,
        })
        .from(messages)
        .where(and(eq(messages.dmId, dm.id), isNull(messages.deletedAt)))
        .orderBy(desc(messages.createdAt))
        .limit(1)

      return {
        id: dm.id,
        type: dm.type,
        members,
        lastMessage: lastMessage ?? undefined,
        createdAt: dm.createdAt,
      }
    }),
  )

  const nextCursor = hasMore ? rows[rows.length - 1]?.createdAt?.toISOString() : undefined

  return { dms: dmList, nextCursor }
}

// ---------------------------------------------------------------------------
// 2. createDm
// ---------------------------------------------------------------------------

export async function createDm(
  type: 'direct' | 'group',
  memberUserIds: string[],
  creatorId: string,
  ipAddress: string,
  userAgent: string,
) {
  // Ensure creator is included in member list
  const allMemberIds = memberUserIds.includes(creatorId)
    ? [...memberUserIds]
    : [creatorId, ...memberUserIds]

  // Deduplicate
  const uniqueMemberIds = [...new Set(allMemberIds)]

  if (type === 'direct') {
    // Must have exactly 2 members (creator + 1 other)
    if (uniqueMemberIds.length !== 2) {
      throw new ValidationError(
        'Direct DMs must have exactly 2 members',
        'INVALID_MEMBER_COUNT',
      )
    }

    // Check for existing 1:1 DM between these 2 users
    const [userA, userB] = uniqueMemberIds as [string, string]

    const existingDmRows = await db
      .select({ dmId: dmMembers.dmId })
      .from(dmMembers)
      .innerJoin(
        dms,
        and(eq(dmMembers.dmId, dms.id), eq(dms.type, 'direct'), isNull(dms.dissolvedAt)),
      )
      .where(eq(dmMembers.userId, userA))

    for (const row of existingDmRows) {
      const [otherMember] = await db
        .select({ userId: dmMembers.userId })
        .from(dmMembers)
        .where(and(eq(dmMembers.dmId, row.dmId), eq(dmMembers.userId, userB)))
        .limit(1)

      if (otherMember) {
        // Return existing DM with members
        const existingMembers = await db
          .select({
            userId: dmMembers.userId,
            fullName: users.fullName,
          })
          .from(dmMembers)
          .innerJoin(users, eq(dmMembers.userId, users.id))
          .where(eq(dmMembers.dmId, row.dmId))

        const [existingDm] = await db
          .select()
          .from(dms)
          .where(eq(dms.id, row.dmId))
          .limit(1)

        return { ...existingDm, members: existingMembers }
      }
    }
  }

  if (type === 'group') {
    if (uniqueMemberIds.length < 2) {
      throw new ValidationError(
        'Group DMs must have at least 2 members',
        'INVALID_MEMBER_COUNT',
      )
    }

    if (uniqueMemberIds.length > MAX_GROUP_DM_MEMBERS) {
      throw new ValidationError(
        `Group DMs cannot exceed ${MAX_GROUP_DM_MEMBERS} members`,
        'GROUP_DM_MEMBER_LIMIT',
      )
    }
  }

  // Validate all member userIds exist
  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, uniqueMemberIds))

  if (existingUsers.length !== uniqueMemberIds.length) {
    throw new ValidationError('One or more user IDs are invalid', 'INVALID_USER_IDS')
  }

  // Create DM record
  const [dm] = await db.insert(dms).values({ type }).returning()

  if (!dm) {
    throw new Error('Failed to create DM')
  }

  // Insert all members
  await db.insert(dmMembers).values(
    uniqueMemberIds.map((userId) => ({
      dmId: dm.id,
      userId,
    })),
  )

  // Fetch members with names
  const members = await db
    .select({
      userId: dmMembers.userId,
      fullName: users.fullName,
    })
    .from(dmMembers)
    .innerJoin(users, eq(dmMembers.userId, users.id))
    .where(eq(dmMembers.dmId, dm.id))

  await logAudit({
    actorId: creatorId,
    actorType: 'user',
    action: 'dm.created',
    targetType: 'dm',
    targetId: dm.id,
    metadata: { type, memberCount: uniqueMemberIds.length },
    ipAddress,
    userAgent,
  })

  for (const uid of uniqueMemberIds) {
    emitToUser(uid, 'dm:created', { ...dm, members })
  }

  return { ...dm, members }
}

// ---------------------------------------------------------------------------
// 3. getDmById
// ---------------------------------------------------------------------------

export async function getDmById(dmId: string) {
  const [dm] = await db.select().from(dms).where(eq(dms.id, dmId)).limit(1)

  if (!dm) {
    throw new NotFoundError('DM not found', 'DM_NOT_FOUND')
  }

  const members = await db
    .select({
      userId: dmMembers.userId,
      fullName: users.fullName,
    })
    .from(dmMembers)
    .innerJoin(users, eq(dmMembers.userId, users.id))
    .where(eq(dmMembers.dmId, dmId))

  return { ...dm, members }
}

// ---------------------------------------------------------------------------
// 4. listDmMembers
// ---------------------------------------------------------------------------

export async function listDmMembers(dmId: string) {
  return db
    .select({
      userId: dmMembers.userId,
      fullName: users.fullName,
      joinedAt: dmMembers.joinedAt,
    })
    .from(dmMembers)
    .innerJoin(users, eq(dmMembers.userId, users.id))
    .where(eq(dmMembers.dmId, dmId))
}

// ---------------------------------------------------------------------------
// 5. addDmMembers
// ---------------------------------------------------------------------------

export async function addDmMembers(
  dmId: string,
  userIds: string[],
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [dm] = await db.select().from(dms).where(eq(dms.id, dmId)).limit(1)

  if (!dm) {
    throw new NotFoundError('DM not found', 'DM_NOT_FOUND')
  }

  if (dm.type !== 'group') {
    throw new ForbiddenError('Cannot add members to a direct DM', 'DIRECT_DM_NO_ADD')
  }

  if (dm.dissolvedAt) {
    throw new ForbiddenError('DM has been dissolved', 'DM_DISSOLVED')
  }

  // Count current members
  const [currentCount] = await db
    .select({ total: count() })
    .from(dmMembers)
    .where(eq(dmMembers.dmId, dmId))

  const currentTotal = currentCount?.total ?? 0
  if (currentTotal + userIds.length > MAX_GROUP_DM_MEMBERS) {
    throw new ValidationError('Group DM member limit exceeded', 'GROUP_DM_MEMBER_LIMIT')
  }

  // Validate all userIds exist
  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, userIds))

  if (existingUsers.length !== userIds.length) {
    throw new ValidationError('One or more user IDs are invalid', 'INVALID_USER_IDS')
  }

  // Insert new members (onConflictDoNothing for duplicates)
  await db
    .insert(dmMembers)
    .values(userIds.map((userId) => ({ dmId, userId })))
    .onConflictDoNothing()

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'dm.members_added',
    targetType: 'dm',
    targetId: dmId,
    metadata: { addedUserIds: userIds },
    ipAddress,
    userAgent,
  })

  for (const uid of userIds) {
    emitToDm(dmId, 'dm:member_added', { userId: uid, dmId })
  }
}

// ---------------------------------------------------------------------------
// 6. removeDmMember
// ---------------------------------------------------------------------------

export async function removeDmMember(
  dmId: string,
  userId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [dm] = await db.select().from(dms).where(eq(dms.id, dmId)).limit(1)

  if (!dm) {
    throw new NotFoundError('DM not found', 'DM_NOT_FOUND')
  }

  if (dm.type !== 'group') {
    throw new ForbiddenError('Cannot remove members from a direct DM', 'DIRECT_DM_NO_REMOVE')
  }

  await db
    .delete(dmMembers)
    .where(and(eq(dmMembers.dmId, dmId), eq(dmMembers.userId, userId)))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'dm.member_removed',
    targetType: 'dm',
    targetId: dmId,
    metadata: { removedUserId: userId },
    ipAddress,
    userAgent,
  })

  emitToDm(dmId, 'dm:member_removed', { userId, dmId })
  emitToUser(userId, 'dm:member_removed', { userId, dmId })
}

// ---------------------------------------------------------------------------
// 7. leaveDm
// ---------------------------------------------------------------------------

export async function leaveDm(dmId: string, userId: string) {
  const [dm] = await db.select().from(dms).where(eq(dms.id, dmId)).limit(1)

  if (!dm) {
    throw new NotFoundError('DM not found', 'DM_NOT_FOUND')
  }

  if (dm.type !== 'group') {
    throw new ForbiddenError('Cannot leave a direct DM', 'DIRECT_DM_NO_LEAVE')
  }

  // Remove self from dmMembers
  await db
    .delete(dmMembers)
    .where(and(eq(dmMembers.dmId, dmId), eq(dmMembers.userId, userId)))

  emitToDm(dmId, 'dm:member_left', { userId, dmId })

  // Check if any members remain
  const [remaining] = await db
    .select({ total: count() })
    .from(dmMembers)
    .where(eq(dmMembers.dmId, dmId))

  if (!remaining || remaining.total === 0) {
    // Dissolve the DM if no members remain
    await db
      .update(dms)
      .set({ dissolvedAt: new Date(), dissolvedBy: userId })
      .where(eq(dms.id, dmId))
  }
}

// ---------------------------------------------------------------------------
// 8. dissolveDm
// ---------------------------------------------------------------------------

export async function dissolveDm(
  dmId: string,
  actorId: string,
  ipAddress: string,
  userAgent: string,
) {
  const [dm] = await db.select().from(dms).where(eq(dms.id, dmId)).limit(1)

  if (!dm) {
    throw new NotFoundError('DM not found', 'DM_NOT_FOUND')
  }

  await db
    .update(dms)
    .set({ dissolvedAt: new Date(), dissolvedBy: actorId })
    .where(eq(dms.id, dmId))

  await logAudit({
    actorId,
    actorType: 'user',
    action: 'dm.dissolved',
    targetType: 'dm',
    targetId: dmId,
    metadata: { type: dm.type },
    ipAddress,
    userAgent,
  })

  emitToDm(dmId, 'dm:dissolved', { dmId })
}

// ---------------------------------------------------------------------------
// 9. getDmMessages
// ---------------------------------------------------------------------------

export async function getDmMessages(dmId: string, cursor?: string, limit: number = 25) {
  const effectiveLimit = Math.min(limit, 100)

  const [dm] = await db.select().from(dms).where(eq(dms.id, dmId)).limit(1)

  if (!dm) {
    throw new NotFoundError('DM not found', 'DM_NOT_FOUND')
  }

  const conditions = [eq(messages.dmId, dmId), isNull(messages.deletedAt)]

  if (cursor) {
    conditions.push(lt(messages.createdAt, new Date(cursor)))
  }

  const rows = await db
    .select({
      id: messages.id,
      userId: messages.userId,
      authorName: users.fullName,
      body: messages.body,
      parentMessageId: messages.parentMessageId,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(effectiveLimit + 1)

  const hasMore = rows.length > effectiveLimit
  const messageList = hasMore ? rows.slice(0, effectiveLimit) : rows

  const nextCursor = hasMore
    ? messageList[messageList.length - 1]?.createdAt?.toISOString()
    : undefined

  return { messages: messageList, nextCursor }
}
