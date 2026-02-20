/**
 * Bookmark service — personal message bookmarks with optional notes.
 *
 * Users can bookmark any message they have access to and attach
 * a personal note for later reference.
 */

import { eq, and, desc, lt } from 'drizzle-orm'
import { db, bookmarks, messages, users, channels, dms } from '@smoker/db'
import { NotFoundError, ConflictError } from '../lib/errors.js'

// ---------------------------------------------------------------------------
// 1. addBookmark
// ---------------------------------------------------------------------------

export async function addBookmark(
  userId: string,
  messageId: string,
  note?: string,
) {
  // Verify the message exists
  const [msg] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)

  if (!msg) {
    throw new NotFoundError('Message not found')
  }

  // Check for existing bookmark
  const [existing] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.messageId, messageId),
      ),
    )
    .limit(1)

  if (existing) {
    throw new ConflictError('Message is already bookmarked')
  }

  const [bookmark] = await db
    .insert(bookmarks)
    .values({
      userId,
      messageId,
      note: note ?? null,
    })
    .returning()

  return bookmark
}

// ---------------------------------------------------------------------------
// 2. removeBookmark
// ---------------------------------------------------------------------------

export async function removeBookmark(userId: string, bookmarkId: string) {
  const [bookmark] = await db
    .select({ id: bookmarks.id, userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId))
    .limit(1)

  if (!bookmark) {
    throw new NotFoundError('Bookmark not found')
  }

  if (bookmark.userId !== userId) {
    throw new NotFoundError('Bookmark not found')
  }

  await db.delete(bookmarks).where(eq(bookmarks.id, bookmarkId))

  return { success: true }
}

// ---------------------------------------------------------------------------
// 3. listBookmarks
// ---------------------------------------------------------------------------

export async function listBookmarks(
  userId: string,
  cursor?: string,
  limit: number = 50,
) {
  const pageLimit = Math.min(limit, 100)

  const conditions = [eq(bookmarks.userId, userId)]

  if (cursor) {
    conditions.push(lt(bookmarks.createdAt, new Date(cursor)))
  }

  const rows = await db
    .select({
      id: bookmarks.id,
      userId: bookmarks.userId,
      messageId: bookmarks.messageId,
      note: bookmarks.note,
      createdAt: bookmarks.createdAt,
      messageBody: messages.body,
      messageUserId: messages.userId,
      messageCreatedAt: messages.createdAt,
      channelId: messages.channelId,
      dmId: messages.dmId,
    })
    .from(bookmarks)
    .innerJoin(messages, eq(bookmarks.messageId, messages.id))
    .where(and(...conditions))
    .orderBy(desc(bookmarks.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const items = hasMore ? rows.slice(0, pageLimit) : rows

  // Fetch channel names and author names
  const channelIds = [...new Set(items.filter((r) => r.channelId).map((r) => r.channelId!))]
  const authorIds = [...new Set(items.map((r) => r.messageUserId))]

  const channelMap: Record<string, string> = {}
  for (const cid of channelIds) {
    const [ch] = await db
      .select({ id: channels.id, name: channels.name })
      .from(channels)
      .where(eq(channels.id, cid))
      .limit(1)
    if (ch) channelMap[ch.id] = ch.name
  }

  const authorMap: Record<string, string> = {}
  for (const uid of authorIds) {
    const [u] = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, uid))
      .limit(1)
    if (u) authorMap[u.id] = u.fullName
  }

  const bookmarkItems = items.map((row) => ({
    id: row.id,
    note: row.note,
    createdAt: row.createdAt,
    message: {
      id: row.messageId,
      body: row.messageBody,
      userId: row.messageUserId,
      authorName: authorMap[row.messageUserId] ?? null,
      createdAt: row.messageCreatedAt,
      channelId: row.channelId,
      channelName: row.channelId ? channelMap[row.channelId] ?? null : null,
      dmId: row.dmId,
    },
  }))

  return {
    bookmarks: bookmarkItems,
    nextCursor: hasMore ? items[items.length - 1]!.createdAt.toISOString() : null,
  }
}

// ---------------------------------------------------------------------------
// 4. updateBookmarkNote
// ---------------------------------------------------------------------------

export async function updateBookmarkNote(
  userId: string,
  bookmarkId: string,
  note: string | null,
) {
  const [bookmark] = await db
    .select({ id: bookmarks.id, userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, bookmarkId))
    .limit(1)

  if (!bookmark) {
    throw new NotFoundError('Bookmark not found')
  }

  if (bookmark.userId !== userId) {
    throw new NotFoundError('Bookmark not found')
  }

  const [updated] = await db
    .update(bookmarks)
    .set({ note })
    .where(eq(bookmarks.id, bookmarkId))
    .returning()

  return updated
}
