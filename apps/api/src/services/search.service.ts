/**
 * Search service layer.
 *
 * Provides full-text search across messages, channels, users, and files.
 * Uses ILIKE for MVP simplicity; permission-aware filtering ensures users
 * only see content they have access to.
 */

import { eq, and, or, desc, ilike, isNull, lt, sql } from 'drizzle-orm'
import {
  db,
  messages,
  channels,
  channelMembers,
  dmMembers,
  users,
  files,
} from '@smoker/db'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_LIMIT = 20
const SEARCH_ALL_TOP_N = 5
const MAX_QUERY_LENGTH = 500

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeQuery(raw: string): string {
  return raw.trim().slice(0, MAX_QUERY_LENGTH).replace(/%/g, '\\%').replace(/_/g, '\\_')
}

function isAdminOrAbove(orgRole: string): boolean {
  return orgRole === 'admin' || orgRole === 'super_admin'
}

// ---------------------------------------------------------------------------
// 1. searchAll
// ---------------------------------------------------------------------------

export async function searchAll(
  query: string,
  userId: string,
  orgRole: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const q = sanitizeQuery(query)
  if (!q) {
    return { messages: [], channels: [], users: [], files: [] }
  }

  const pattern = `%${q}%`

  // Run all four searches in parallel, each capped at top N
  const [msgResult, channelResult, userResult, fileResult] = await Promise.all([
    searchMessages(query, userId, orgRole, { limit: SEARCH_ALL_TOP_N }),
    searchChannels(query),
    searchUsers(query),
    searchFiles(query, userId, orgRole, { limit: SEARCH_ALL_TOP_N }),
  ])

  return {
    messages: msgResult.messages,
    channels: channelResult,
    users: userResult,
    files: fileResult.files,
  }
}

// ---------------------------------------------------------------------------
// 2. searchMessages
// ---------------------------------------------------------------------------

export async function searchMessages(
  query: string,
  userId: string,
  orgRole: string,
  options: {
    channelId?: string
    dmId?: string
    cursor?: string
    limit?: number
  } = {},
) {
  const q = sanitizeQuery(query)
  if (!q) {
    return { messages: [], nextCursor: null }
  }

  const pageLimit = Math.min(options.limit ?? DEFAULT_PAGE_LIMIT, 100)
  const pattern = `%${q}%`

  // Build conditions
  const conditions: ReturnType<typeof eq>[] = [
    ilike(messages.body, pattern),
    isNull(messages.deletedAt),
  ]

  if (options.cursor) {
    conditions.push(lt(messages.createdAt, new Date(options.cursor)))
  }

  if (options.channelId) {
    conditions.push(eq(messages.channelId, options.channelId))
  }

  if (options.dmId) {
    conditions.push(eq(messages.dmId, options.dmId))
  }

  if (isAdminOrAbove(orgRole)) {
    // Admin can see all messages
    const rows = await db
      .select({
        id: messages.id,
        body: messages.body,
        userId: messages.userId,
        authorName: users.fullName,
        channelId: messages.channelId,
        dmId: messages.dmId,
        createdAt: messages.createdAt,
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

  // Non-admin: only messages in channels/DMs user is a member of
  // Use a subquery approach to check membership
  const accessibleChannelIds = db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, userId))

  const accessibleDmIds = db
    .select({ dmId: dmMembers.dmId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, userId))

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      userId: messages.userId,
      authorName: users.fullName,
      channelId: messages.channelId,
      dmId: messages.dmId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .where(
      and(
        ...conditions,
        or(
          sql`${messages.channelId} IN (${accessibleChannelIds})`,
          sql`${messages.dmId} IN (${accessibleDmIds})`,
        ),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null

  return { messages: page, nextCursor }
}

// ---------------------------------------------------------------------------
// 3. searchChannels
// ---------------------------------------------------------------------------

export async function searchChannels(query: string) {
  const q = sanitizeQuery(query)
  if (!q) {
    return []
  }

  const pattern = `%${q}%`

  const rows = await db
    .select({
      id: channels.id,
      name: channels.name,
      topic: channels.topic,
      type: channels.type,
      scope: channels.scope,
      status: channels.status,
    })
    .from(channels)
    .where(
      and(
        eq(channels.status, 'active'),
        or(ilike(channels.name, pattern), ilike(channels.topic, pattern)),
      ),
    )
    .orderBy(channels.name)
    .limit(SEARCH_ALL_TOP_N)

  return rows
}

// ---------------------------------------------------------------------------
// 4. searchUsers
// ---------------------------------------------------------------------------

export async function searchUsers(query: string) {
  const q = sanitizeQuery(query)
  if (!q) {
    return []
  }

  const pattern = `%${q}%`

  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      orgRole: users.orgRole,
      status: users.status,
    })
    .from(users)
    .where(and(eq(users.status, 'active'), ilike(users.fullName, pattern)))
    .orderBy(users.fullName)
    .limit(SEARCH_ALL_TOP_N)

  return rows
}

// ---------------------------------------------------------------------------
// 5. searchFiles
// ---------------------------------------------------------------------------

export async function searchFiles(
  query: string,
  userId: string,
  orgRole: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const q = sanitizeQuery(query)
  if (!q) {
    return { files: [], nextCursor: null }
  }

  const pageLimit = Math.min(options.limit ?? DEFAULT_PAGE_LIMIT, 100)
  const pattern = `%${q}%`

  const conditions: ReturnType<typeof eq>[] = [
    ilike(files.originalFilename, pattern),
  ]

  if (options.cursor) {
    conditions.push(lt(files.createdAt, new Date(options.cursor)))
  }

  if (isAdminOrAbove(orgRole)) {
    const rows = await db
      .select({
        id: files.id,
        originalFilename: files.originalFilename,
        mimeType: files.mimeType,
        channelId: files.channelId,
        dmId: files.dmId,
        userId: files.userId,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(and(...conditions))
      .orderBy(desc(files.createdAt))
      .limit(pageLimit + 1)

    const hasMore = rows.length > pageLimit
    const page = hasMore ? rows.slice(0, pageLimit) : rows
    const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null

    return { files: page, nextCursor }
  }

  // Non-admin: only files in channels/DMs user is a member of
  const accessibleChannelIds = db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, userId))

  const accessibleDmIds = db
    .select({ dmId: dmMembers.dmId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, userId))

  const rows = await db
    .select({
      id: files.id,
      originalFilename: files.originalFilename,
      mimeType: files.mimeType,
      channelId: files.channelId,
      dmId: files.dmId,
      userId: files.userId,
      createdAt: files.createdAt,
    })
    .from(files)
    .where(
      and(
        ...conditions,
        or(
          sql`${files.channelId} IN (${accessibleChannelIds})`,
          sql`${files.dmId} IN (${accessibleDmIds})`,
        ),
      ),
    )
    .orderBy(desc(files.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore ? page[page.length - 1]!.createdAt.toISOString() : null

  return { files: page, nextCursor }
}
