/**
 * Unread message service.
 *
 * Tracks per-channel and per-DM unread counts by comparing
 * each member's `last_read_at` timestamp against message creation times.
 */

import { eq, and, gt, ne, isNull, sql, count } from 'drizzle-orm'
import {
  db,
  channelMembers,
  dmMembers,
  messages,
} from '@smoker/db'
import { logger } from '../lib/logger.js'

// ---------------------------------------------------------------------------
// 1. getUnreadCounts — returns per-channel and per-DM unread counts
// ---------------------------------------------------------------------------

export async function getUnreadCounts(userId: string): Promise<{
  channels: Record<string, number>
  dms: Record<string, number>
  total: number
}> {
  // Get unread counts for all channels the user is a member of
  const channelCounts = await db
    .select({
      channelId: channelMembers.channelId,
      unreadCount: sql<number>`(
        select count(*)::int
        from messages m
        where m.channel_id = ${channelMembers.channelId}
          and m.created_at > ${channelMembers.lastReadAt}
          and m.user_id != ${userId}
          and m.deleted_at is null
          and m.parent_message_id is null
      )`,
    })
    .from(channelMembers)
    .where(eq(channelMembers.userId, userId))

  // Get unread counts for all DMs the user is a member of
  const dmCounts = await db
    .select({
      dmId: dmMembers.dmId,
      unreadCount: sql<number>`(
        select count(*)::int
        from messages m
        where m.dm_id = ${dmMembers.dmId}
          and m.created_at > ${dmMembers.lastReadAt}
          and m.user_id != ${userId}
          and m.deleted_at is null
          and m.parent_message_id is null
      )`,
    })
    .from(dmMembers)
    .where(eq(dmMembers.userId, userId))

  const channelsMap: Record<string, number> = {}
  let total = 0

  for (const row of channelCounts) {
    const c = row.unreadCount ?? 0
    if (c > 0) {
      channelsMap[row.channelId] = c
      total += c
    }
  }

  const dmsMap: Record<string, number> = {}

  for (const row of dmCounts) {
    const c = row.unreadCount ?? 0
    if (c > 0) {
      dmsMap[row.dmId] = c
      total += c
    }
  }

  return { channels: channelsMap, dms: dmsMap, total }
}

// ---------------------------------------------------------------------------
// 2. markAsRead — update lastReadAt to now
// ---------------------------------------------------------------------------

export async function markAsRead(
  userId: string,
  channelId?: string,
  dmId?: string,
): Promise<void> {
  if (channelId) {
    await db
      .update(channelMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(channelMembers.channelId, channelId),
          eq(channelMembers.userId, userId),
        ),
      )

    logger.debug({ userId, channelId }, 'Marked channel as read')
  }

  if (dmId) {
    await db
      .update(dmMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(dmMembers.dmId, dmId),
          eq(dmMembers.userId, userId),
        ),
      )

    logger.debug({ userId, dmId }, 'Marked DM as read')
  }
}

// ---------------------------------------------------------------------------
// 3. getTotalUnread — sum of all unread across channels + DMs
// ---------------------------------------------------------------------------

export async function getTotalUnread(userId: string): Promise<number> {
  const { total } = await getUnreadCounts(userId)
  return total
}
