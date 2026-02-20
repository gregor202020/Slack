/**
 * Pin service — pin, unpin, and list pinned messages for a channel.
 *
 * Emits socket events:
 *   pin:added   — when a message is pinned
 *   pin:removed — when a message is unpinned
 */

import { eq, and, desc } from 'drizzle-orm'
import { db, pinnedMessages, messages, users } from '@smoker/db'
import { NotFoundError, ConflictError } from '../lib/errors.js'
import { emitToChannel } from '../plugins/socket.js'

// ---------------------------------------------------------------------------
// 1. pinMessage
// ---------------------------------------------------------------------------

export async function pinMessage(
  channelId: string,
  messageId: string,
  userId: string,
) {
  // Verify the message exists and belongs to the channel
  const [msg] = await db
    .select({ id: messages.id, channelId: messages.channelId })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.channelId, channelId)))
    .limit(1)

  if (!msg) {
    throw new NotFoundError('Message not found in this channel')
  }

  // Check for existing pin
  const [existing] = await db
    .select({ id: pinnedMessages.id })
    .from(pinnedMessages)
    .where(
      and(
        eq(pinnedMessages.channelId, channelId),
        eq(pinnedMessages.messageId, messageId),
      ),
    )
    .limit(1)

  if (existing) {
    throw new ConflictError('Message is already pinned')
  }

  const [pin] = await db
    .insert(pinnedMessages)
    .values({
      channelId,
      messageId,
      pinnedBy: userId,
    })
    .returning()

  emitToChannel(channelId, 'pin:added', {
    channelId,
    messageId,
    pinnedBy: userId,
    pinId: pin!.id,
  })

  return pin
}

// ---------------------------------------------------------------------------
// 2. unpinMessage
// ---------------------------------------------------------------------------

export async function unpinMessage(
  channelId: string,
  messageId: string,
  _userId: string,
) {
  const [pin] = await db
    .select({ id: pinnedMessages.id })
    .from(pinnedMessages)
    .where(
      and(
        eq(pinnedMessages.channelId, channelId),
        eq(pinnedMessages.messageId, messageId),
      ),
    )
    .limit(1)

  if (!pin) {
    throw new NotFoundError('Pin not found')
  }

  await db
    .delete(pinnedMessages)
    .where(eq(pinnedMessages.id, pin.id))

  emitToChannel(channelId, 'pin:removed', {
    channelId,
    messageId,
  })

  return { success: true }
}

// ---------------------------------------------------------------------------
// 3. listPinnedMessages
// ---------------------------------------------------------------------------

export async function listPinnedMessages(channelId: string) {
  const pins = await db
    .select({
      id: pinnedMessages.id,
      channelId: pinnedMessages.channelId,
      messageId: pinnedMessages.messageId,
      pinnedBy: pinnedMessages.pinnedBy,
      pinnedAt: pinnedMessages.pinnedAt,
      messageBody: messages.body,
      messageCreatedAt: messages.createdAt,
      messageUserId: messages.userId,
      pinnerName: users.fullName,
    })
    .from(pinnedMessages)
    .innerJoin(messages, eq(pinnedMessages.messageId, messages.id))
    .innerJoin(users, eq(pinnedMessages.pinnedBy, users.id))
    .where(eq(pinnedMessages.channelId, channelId))
    .orderBy(desc(pinnedMessages.pinnedAt))

  // Fetch message author names in a second pass
  const authorIds = [...new Set(pins.map((p) => p.messageUserId))]
  const authors = authorIds.length > 0
    ? await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(
          authorIds.length === 1
            ? eq(users.id, authorIds[0]!)
            : eq(users.id, authorIds[0]!), // fallback for single
        )
    : []

  // For multiple authors, fetch all
  let authorMap: Record<string, string> = {}
  if (authorIds.length > 0) {
    const allAuthors = await Promise.all(
      authorIds.map(async (id) => {
        const [u] = await db
          .select({ id: users.id, fullName: users.fullName })
          .from(users)
          .where(eq(users.id, id))
          .limit(1)
        return u
      }),
    )
    authorMap = Object.fromEntries(
      allAuthors.filter(Boolean).map((u) => [u!.id, u!.fullName]),
    )
  }

  return pins.map((pin) => ({
    id: pin.id,
    channelId: pin.channelId,
    messageId: pin.messageId,
    pinnedBy: pin.pinnedBy,
    pinnedAt: pin.pinnedAt,
    pinnerName: pin.pinnerName,
    message: {
      id: pin.messageId,
      body: pin.messageBody,
      userId: pin.messageUserId,
      authorName: authorMap[pin.messageUserId] ?? null,
      createdAt: pin.messageCreatedAt,
    },
  }))
}
