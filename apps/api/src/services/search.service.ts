/**
 * Search service layer.
 *
 * Provides full-text search across messages, channels, and users using
 * PostgreSQL tsvector / tsquery with GIN indexes for fast lookups.
 * Permission-aware filtering ensures users only see content they have
 * access to (channel membership, DM membership, public visibility).
 */

import { eq, and, or, desc, isNull, sql } from 'drizzle-orm'
import {
  db,
  messages,
  channels,
  channelMembers,
  dmMembers,
  users,
} from '@smoker/db'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_LIMIT = 25
const SEARCH_ALL_TOP_N = 5
const HEADLINE_OPTIONS = 'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, MaxFragments=2'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw user query into a PostgreSQL tsquery string.
 * Splits on whitespace and joins with & (AND) for multi-word queries.
 * Appends :* for prefix matching on the last token.
 */
function toTsQuery(raw: string): string {
  const tokens = raw
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (tokens.length === 0) return ''

  // All tokens except last use exact match; last token gets prefix match
  return tokens
    .map((t, i) => (i === tokens.length - 1 ? `${t}:*` : t))
    .join(' & ')
}

function isAdminOrAbove(orgRole: string): boolean {
  return orgRole === 'admin' || orgRole === 'super_admin'
}

// ---------------------------------------------------------------------------
// 1. searchMessages
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
  const tsq = toTsQuery(query)
  if (!tsq) return { messages: [], nextCursor: null }

  const pageLimit = Math.min(options.limit ?? DEFAULT_PAGE_LIMIT, 100)

  // Build the tsquery expression once
  const tsquery = sql`to_tsquery('english', ${tsq})`
  const tsvec = sql`to_tsvector('english', ${messages.body})`

  // Conditions all queries share
  const baseConditions = [
    sql`${tsvec} @@ ${tsquery}`,
    isNull(messages.deletedAt),
  ]

  if (options.cursor) {
    baseConditions.push(
      sql`${messages.createdAt} < ${options.cursor}` as ReturnType<typeof eq>,
    )
  }

  if (options.channelId) {
    baseConditions.push(eq(messages.channelId, options.channelId))
  }

  if (options.dmId) {
    baseConditions.push(eq(messages.dmId, options.dmId))
  }

  // ts_headline for highlighted snippets
  const headline = sql<string>`ts_headline('english', ${messages.body}, ${tsquery}, ${HEADLINE_OPTIONS})`

  // ts_rank for relevance ordering
  const rank = sql<number>`ts_rank(${tsvec}, ${tsquery})`

  if (isAdminOrAbove(orgRole)) {
    const rows = await db
      .select({
        id: messages.id,
        body: messages.body,
        headline,
        userId: messages.userId,
        authorName: users.fullName,
        channelId: messages.channelId,
        channelName: channels.name,
        dmId: messages.dmId,
        createdAt: messages.createdAt,
        rank,
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .leftJoin(channels, eq(messages.channelId, channels.id))
      .where(and(...baseConditions))
      .orderBy(desc(rank), desc(messages.createdAt))
      .limit(pageLimit + 1)

    const hasMore = rows.length > pageLimit
    const page = hasMore ? rows.slice(0, pageLimit) : rows
    const nextCursor = hasMore
      ? page[page.length - 1]!.createdAt.toISOString()
      : null

    return { messages: page, nextCursor }
  }

  // Non-admin: only messages in channels/DMs user is a member of
  // Also include public channels the user can see
  const accessibleChannelIds = db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, userId))

  const publicChannelIds = db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.type, 'public'), eq(channels.status, 'active')))

  const accessibleDmIds = db
    .select({ dmId: dmMembers.dmId })
    .from(dmMembers)
    .where(eq(dmMembers.userId, userId))

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      headline,
      userId: messages.userId,
      authorName: users.fullName,
      channelId: messages.channelId,
      channelName: channels.name,
      dmId: messages.dmId,
      createdAt: messages.createdAt,
      rank,
    })
    .from(messages)
    .innerJoin(users, eq(messages.userId, users.id))
    .leftJoin(channels, eq(messages.channelId, channels.id))
    .where(
      and(
        ...baseConditions,
        or(
          sql`${messages.channelId} IN (${accessibleChannelIds})`,
          sql`${messages.channelId} IN (${publicChannelIds})`,
          sql`${messages.dmId} IN (${accessibleDmIds})`,
        ),
      ),
    )
    .orderBy(desc(rank), desc(messages.createdAt))
    .limit(pageLimit + 1)

  const hasMore = rows.length > pageLimit
  const page = hasMore ? rows.slice(0, pageLimit) : rows
  const nextCursor = hasMore
    ? page[page.length - 1]!.createdAt.toISOString()
    : null

  return { messages: page, nextCursor }
}

// ---------------------------------------------------------------------------
// 2. searchChannels
// ---------------------------------------------------------------------------

export async function searchChannels(query: string, userId: string, orgRole?: string) {
  const tsq = toTsQuery(query)
  if (!tsq) return []

  const tsquery = sql`to_tsquery('english', ${tsq})`
  const tsvec = sql`to_tsvector('english', ${channels.name})`

  const baseConditions = [
    sql`${tsvec} @@ ${tsquery}`,
    eq(channels.status, 'active'),
  ]

  if (orgRole && isAdminOrAbove(orgRole)) {
    // Admin can see all channels
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
      .where(and(...baseConditions))
      .orderBy(channels.name)
      .limit(SEARCH_ALL_TOP_N)

    return rows
  }

  // Non-admin: public channels + channels user is a member of
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
    .leftJoin(
      channelMembers,
      and(eq(channels.id, channelMembers.channelId), eq(channelMembers.userId, userId)),
    )
    .where(
      and(
        ...baseConditions,
        or(
          eq(channels.type, 'public'),
          sql`${channelMembers.userId} IS NOT NULL`,
        ),
      ),
    )
    .orderBy(channels.name)
    .limit(SEARCH_ALL_TOP_N)

  return rows
}

// ---------------------------------------------------------------------------
// 3. searchUsers
// ---------------------------------------------------------------------------

export async function searchUsers(query: string) {
  const tsq = toTsQuery(query)
  if (!tsq) return []

  const tsquery = sql`to_tsquery('english', ${tsq})`
  const tsvec = sql`to_tsvector('english', ${users.fullName})`

  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      orgRole: users.orgRole,
      status: users.status,
    })
    .from(users)
    .where(
      and(
        eq(users.status, 'active'),
        sql`${tsvec} @@ ${tsquery}`,
      ),
    )
    .orderBy(users.fullName)
    .limit(SEARCH_ALL_TOP_N)

  return rows
}

// ---------------------------------------------------------------------------
// 4. searchAll
// ---------------------------------------------------------------------------

export async function searchAll(
  query: string,
  userId: string,
  orgRole: string,
  options: { cursor?: string; limit?: number } = {},
) {
  const tsq = toTsQuery(query)
  if (!tsq) {
    return { messages: [], channels: [], users: [] }
  }

  const [msgResult, channelResult, userResult] = await Promise.all([
    searchMessages(query, userId, orgRole, { limit: SEARCH_ALL_TOP_N }),
    searchChannels(query, userId, orgRole),
    searchUsers(query),
  ])

  return {
    messages: msgResult.messages,
    channels: channelResult,
    users: userResult,
  }
}
