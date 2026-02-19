/**
 * Message service layer.
 *
 * Handles message CRUD, thread replies, edit history,
 * emoji reactions, and mention extraction.
 */

import { eq, and, desc, asc, count, isNull, lt, ne, sql } from 'drizzle-orm'
import {
  db,
  messages,
  messageVersions,
  messageReactions,
  mentions,
  users,
  dmMembers,
  deletedVault,
} from '@smoker/db'
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../lib/errors.js'
import { logAudit } from '../lib/audit.js'
import { sanitizeHtmlContent, stripNullBytes } from '../lib/sanitize.js'
import { sha256 } from '../lib/crypto.js'
import { isSuperAdmin } from '../middleware/roles.js'
import { emitToChannel, emitToDm } from '../plugins/socket.js'
import { notifyNewMessage, notifyNewDM } from './notification.service.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_LIMIT = 50
const MAX_MESSAGE_BODY_LENGTH = 40_000
const MAX_REACTIONS_PER_MESSAGE = 20
const VAULT_RETENTION_DAYS = 180

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a message body: strip null bytes, sanitize HTML, and enforce
 * the maximum character length.
 */
function sanitizeBody(raw: string): string {
  const cleaned = sanitizeHtmlContent(stripNullBytes(raw))

  if (cleaned.length > MAX_MESSAGE_BODY_LENGTH) {
    throw new ValidationError(
      `Message body exceeds maximum length of ${MAX_MESSAGE_BODY_LENGTH} characters`,
      'MESSAGE_TOO_LONG',
    )
  }

  return cleaned
}

/**
 * Extract @channel and @here mention patterns from a message body and
 * persist them as mention records.
 */
async function extractAndStoreMentions(
  messageId: string,
  body: string,
): Promise<void> {
  const mentionRecords: { messageId: string; mentionType: string }[] = []

  if (body.includes('@channel')) {
    mentionRecords.push({ messageId, mentionType: 'channel' })
  }

  if (body.includes('@here')) {
    mentionRecords.push({ messageId, mentionType: 'here' })
  }

  // Store user-pattern mentions for future resolution
  const userMentionRegex = /@([a-zA-Z0-9_]+)/g
  let match: RegExpExecArray | null
  const seen = new Set<string>()

  while ((match = userMentionRegex.exec(body)) !== null) {
    const handle = match[1]!
    // Skip the special keywords we already handled
    if (handle === 'channel' || handle === 'here') continue
    if (seen.has(handle)) continue
    seen.add(handle)

    mentionRecords.push({ messageId, mentionType: 'user' })
  }

  if (mentionRecords.length > 0) {
    await db.insert(mentions).values(mentionRecords)
  }
}

// ---------------------------------------------------------------------------
// 1. getChannelMessages
// ---------------------------------------------------------------------------

export async function getChannelMessages(
  channelId: string,
  cursor?: string,
  limit?: number,
) {
  const pageLimit = Math.min(limit ?? DEFAULT_PAGE_LIMIT, 100)

  const threadReplyCount = db
    .select({ cnt: count() })
    .from(messages)
    .where(
      and(
        eq(messages.parentMessageId, messages.id),
        isNull(messages.deletedAt),
      ),
    )

  const conditions = [eq(messages.channelId, channelId), isNull(messages.deletedAt)]

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
      threadReplyCount: sql<number>`(
        select count(*)::int
        from messages as t
        where t.parent_message_id = ${messages.id}
          and t.deleted_at is null
      )`,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null

  return { messages: page, nextCursor }
}

// ---------------------------------------------------------------------------
// 2. sendChannelMessage
// ---------------------------------------------------------------------------

export async function sendChannelMessage(
  channelId: string,
  body: string,
  userId: string,
  parentMessageId?: string,
) {
  const sanitizedBody = sanitizeBody(body)

  // Verify parent message exists in the same channel
  if (parentMessageId) {
    const [parent] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.id, parentMessageId),
          eq(messages.channelId, channelId),
          isNull(messages.deletedAt),
        ),
      )
      .limit(1)

    if (!parent) {
      throw new NotFoundError('Parent message not found in this channel', 'PARENT_NOT_FOUND')
    }
  }

  const [message] = await db
    .insert(messages)
    .values({
      channelId,
      userId,
      parentMessageId: parentMessageId ?? null,
      body: sanitizedBody,
    })
    .returning()

  if (!message) {
    throw new Error('Failed to create message')
  }

  await extractAndStoreMentions(message.id, sanitizedBody)

  emitToChannel(channelId, 'message:new', message)

  // Push notification to offline channel members (non-blocking)
  notifyNewMessage(channelId, userId, sanitizedBody)
    .catch((err) => console.error('[push] Failed to notify channel message:', err))

  return message
}

// ---------------------------------------------------------------------------
// 3. sendDmMessage
// ---------------------------------------------------------------------------

export async function sendDmMessage(
  dmId: string,
  body: string,
  userId: string,
  parentMessageId?: string,
) {
  const sanitizedBody = sanitizeBody(body)

  // Verify user is a DM member (admin bypass is handled by middleware)
  const [membership] = await db
    .select({ dmId: dmMembers.dmId })
    .from(dmMembers)
    .where(and(eq(dmMembers.dmId, dmId), eq(dmMembers.userId, userId)))
    .limit(1)

  if (!membership) {
    throw new ForbiddenError('Not a member of this DM', 'NOT_DM_MEMBER')
  }

  // Verify parent message exists in the same DM
  if (parentMessageId) {
    const [parent] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.id, parentMessageId),
          eq(messages.dmId, dmId),
          isNull(messages.deletedAt),
        ),
      )
      .limit(1)

    if (!parent) {
      throw new NotFoundError('Parent message not found in this DM', 'PARENT_NOT_FOUND')
    }
  }

  const [message] = await db
    .insert(messages)
    .values({
      dmId,
      userId,
      parentMessageId: parentMessageId ?? null,
      body: sanitizedBody,
    })
    .returning()

  if (!message) {
    throw new Error('Failed to create message')
  }

  await extractAndStoreMentions(message.id, sanitizedBody)

  emitToDm(dmId, 'message:new', message)

  // Push notification to other DM members (non-blocking)
  db
    .select({ userId: dmMembers.userId })
    .from(dmMembers)
    .where(and(eq(dmMembers.dmId, dmId), ne(dmMembers.userId, userId)))
    .then((otherMembers) => {
      for (const member of otherMembers) {
        notifyNewDM(userId, member.userId, sanitizedBody)
          .catch((err) => console.error('[push] Failed to notify DM message:', err))
      }
    })
    .catch((err) => console.error('[push] Failed to query DM members for push:', err))

  return message
}

// ---------------------------------------------------------------------------
// 4. getMessageById
// ---------------------------------------------------------------------------

export async function getMessageById(messageId: string) {
  const [row] = await db
    .select({
      id: messages.id,
      channelId: messages.channelId,
      dmId: messages.dmId,
      userId: messages.userId,
      authorName: users.fullName,
      parentMessageId: messages.parentMessageId,
      body: messages.body,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(eq(messages.id, messageId))
    .limit(1)

  if (!row) {
    throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND')
  }

  return row
}

// ---------------------------------------------------------------------------
// 5. editMessage
// ---------------------------------------------------------------------------

export async function editMessage(
  messageId: string,
  newBody: string,
  userId: string,
  _orgRole: string,
) {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)

  if (!message) {
    throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND')
  }

  // Only the author can edit — no exception for super_admin
  if (message.userId !== userId) {
    throw new ForbiddenError('Only the message author can edit', 'NOT_MESSAGE_AUTHOR')
  }

  // Save current body to version history before overwriting
  await db.insert(messageVersions).values({
    messageId,
    body: message.body,
    editedBy: userId,
  })

  const sanitizedBody = sanitizeBody(newBody)

  const [updated] = await db
    .update(messages)
    .set({
      body: sanitizedBody,
      updatedAt: new Date(),
    })
    .where(eq(messages.id, messageId))
    .returning()

  if (updated) {
    const payload = { messageId, body: updated.body, editedAt: updated.updatedAt }
    if (message.channelId) {
      emitToChannel(message.channelId, 'message:edited', payload)
    } else if (message.dmId) {
      emitToDm(message.dmId, 'message:edited', payload)
    }
  }

  return updated
}

// ---------------------------------------------------------------------------
// 6. deleteMessage
// ---------------------------------------------------------------------------

export async function deleteMessage(
  messageId: string,
  userId: string,
  orgRole: string,
  ipAddress: string,
  userAgent: string,
) {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)

  if (!message) {
    throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND')
  }

  // Permission check: author or super admin
  const isAuthor = message.userId === userId
  const isSuper = orgRole === 'super_admin'

  if (!isAuthor && !isSuper) {
    throw new ForbiddenError(
      'Only the message author or a super admin can delete',
      'DELETE_FORBIDDEN',
    )
  }

  // Save content to deleted vault with 180-day retention
  const purgeAfter = new Date()
  purgeAfter.setDate(purgeAfter.getDate() + VAULT_RETENTION_DAYS)

  const contentPayload = {
    id: message.id,
    channelId: message.channelId,
    dmId: message.dmId,
    userId: message.userId,
    parentMessageId: message.parentMessageId,
    body: message.body,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  }

  await db.insert(deletedVault).values({
    originalType: 'message',
    originalId: message.id,
    content: contentPayload,
    contentHash: sha256(JSON.stringify(contentPayload)),
    deletedBy: userId,
    purgeAfter,
  })

  // Soft delete
  await db
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(eq(messages.id, messageId))

  if (message.channelId) {
    emitToChannel(message.channelId, 'message:deleted', { messageId })
  } else if (message.dmId) {
    emitToDm(message.dmId, 'message:deleted', { messageId })
  }

  // Audit log
  const action = isSuper && !isAuthor ? 'message.deleted_by_admin' : 'message.deleted'

  await logAudit({
    actorId: userId,
    actorType: 'user',
    action,
    targetType: 'message',
    targetId: messageId,
    metadata: {
      channelId: message.channelId,
      dmId: message.dmId,
      originalAuthorId: message.userId,
    },
    ipAddress,
    userAgent,
  })

  return { success: true as const }
}

// ---------------------------------------------------------------------------
// 7. getThreadReplies
// ---------------------------------------------------------------------------

export async function getThreadReplies(
  parentMessageId: string,
  cursor?: string,
  limit?: number,
) {
  const pageLimit = Math.min(limit ?? DEFAULT_PAGE_LIMIT, 100)

  const conditions = [
    eq(messages.parentMessageId, parentMessageId),
    isNull(messages.deletedAt),
  ]

  if (cursor) {
    // Threads show oldest first, so cursor pages forward in time
    const cursorDate = new Date(cursor)
    conditions.push(
      sql`${messages.createdAt} > ${cursorDate}` as ReturnType<typeof eq>,
    )
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
    .orderBy(asc(messages.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null

  return { messages: page, nextCursor }
}

// ---------------------------------------------------------------------------
// 8. getMessageVersions
// ---------------------------------------------------------------------------

export async function getMessageVersions(
  messageId: string,
  userId: string,
  orgRole: string,
) {
  const [message] = await db
    .select({ id: messages.id, userId: messages.userId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)

  if (!message) {
    throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND')
  }

  // Normal users can only see versions of their own messages
  if (orgRole !== 'super_admin' && message.userId !== userId) {
    throw new ForbiddenError(
      'You can only view edit history of your own messages',
      'VERSION_ACCESS_DENIED',
    )
  }

  const versions = await db
    .select({
      id: messageVersions.id,
      messageId: messageVersions.messageId,
      body: messageVersions.body,
      editedAt: messageVersions.editedAt,
      editedBy: messageVersions.editedBy,
    })
    .from(messageVersions)
    .where(eq(messageVersions.messageId, messageId))
    .orderBy(desc(messageVersions.editedAt))

  return versions
}

// ---------------------------------------------------------------------------
// 9. addReaction
// ---------------------------------------------------------------------------

export async function addReaction(
  messageId: string,
  emoji: string,
  userId: string,
) {
  // Verify message exists
  const [message] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
    .limit(1)

  if (!message) {
    throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND')
  }

  // Check distinct emoji cap
  const [emojiCount] = await db
    .select({ total: sql<number>`count(distinct ${messageReactions.emoji})::int` })
    .from(messageReactions)
    .where(eq(messageReactions.messageId, messageId))

  if (emojiCount && emojiCount.total >= MAX_REACTIONS_PER_MESSAGE) {
    // Check if this emoji already exists (adding another user is fine)
    const [existingEmoji] = await db
      .select({ id: messageReactions.id })
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.emoji, emoji),
        ),
      )
      .limit(1)

    if (!existingEmoji) {
      throw new ValidationError(
        'Maximum emoji reactions reached',
        'MAX_REACTIONS_REACHED',
      )
    }
  }

  // Insert reaction — the unique index prevents duplicates
  try {
    const [reaction] = await db
      .insert(messageReactions)
      .values({ messageId, userId, emoji })
      .returning()

    if (reaction) {
      const [parentMsg] = await db
        .select({ channelId: messages.channelId, dmId: messages.dmId })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1)

      if (parentMsg?.channelId) {
        emitToChannel(parentMsg.channelId, 'reaction:added', reaction)
      } else if (parentMsg?.dmId) {
        emitToDm(parentMsg.dmId, 'reaction:added', reaction)
      }
    }

    return reaction
  } catch (error: unknown) {
    // Handle unique constraint violation (user already reacted with this emoji)
    const err = error as { code?: string }
    if (err.code === '23505') {
      throw new ConflictError('You have already reacted with this emoji', 'DUPLICATE_REACTION')
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// 10. removeReaction
// ---------------------------------------------------------------------------

export async function removeReaction(reactionId: string, userId: string) {
  const [reaction] = await db
    .select()
    .from(messageReactions)
    .where(eq(messageReactions.id, reactionId))
    .limit(1)

  if (!reaction) {
    throw new NotFoundError('Reaction not found', 'REACTION_NOT_FOUND')
  }

  if (reaction.userId !== userId) {
    throw new ForbiddenError('You can only remove your own reactions', 'NOT_REACTION_OWNER')
  }

  await db.delete(messageReactions).where(eq(messageReactions.id, reactionId))

  const [parentMsg] = await db
    .select({ channelId: messages.channelId, dmId: messages.dmId })
    .from(messages)
    .where(eq(messages.id, reaction.messageId))
    .limit(1)

  if (parentMsg?.channelId) {
    emitToChannel(parentMsg.channelId, 'reaction:removed', { reactionId, messageId: reaction.messageId })
  } else if (parentMsg?.dmId) {
    emitToDm(parentMsg.dmId, 'reaction:removed', { reactionId, messageId: reaction.messageId })
  }

  return { success: true as const }
}

// ---------------------------------------------------------------------------
// 11. listReactions
// ---------------------------------------------------------------------------

export async function listReactions(messageId: string) {
  const rows = await db
    .select({
      id: messageReactions.id,
      emoji: messageReactions.emoji,
      userId: messageReactions.userId,
      userName: users.fullName,
      createdAt: messageReactions.createdAt,
    })
    .from(messageReactions)
    .innerJoin(users, eq(messageReactions.userId, users.id))
    .where(eq(messageReactions.messageId, messageId))
    .orderBy(messageReactions.createdAt)

  return rows
}

// ---------------------------------------------------------------------------
// 12. getDmMessages
// ---------------------------------------------------------------------------

export async function getDmMessages(
  dmId: string,
  cursor?: string,
  limit?: number,
) {
  const pageLimit = Math.min(limit ?? DEFAULT_PAGE_LIMIT, 100)

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
      threadReplyCount: sql<number>`(
        select count(*)::int
        from messages as t
        where t.parent_message_id = ${messages.id}
          and t.deleted_at is null
      )`,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null

  return { messages: page, nextCursor }
}
