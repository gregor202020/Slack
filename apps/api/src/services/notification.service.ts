/**
 * Push notification service layer.
 *
 * Handles FCM device token registration, push notification delivery,
 * and domain-specific notification helpers for announcements, shifts,
 * DMs, and channel messages.
 */

import admin from 'firebase-admin'
import { eq, and, inArray, ne } from 'drizzle-orm'
import {
  db,
  deviceTokens,
  users,
  userVenues,
  channelMembers,
  dmMembers,
  channels,
} from '@smoker/db'
import { getFirebaseApp } from '../plugins/firebase.js'
import { getOnlineUsers } from '../plugins/socket.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMessaging(): admin.messaging.Messaging | null {
  const app = getFirebaseApp()
  if (!app) return null
  return admin.messaging(app)
}

/**
 * Remove invalid/expired FCM tokens from the database.
 * Called when FCM reports tokens as unregistered.
 */
async function cleanupInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return
  await db
    .delete(deviceTokens)
    .where(inArray(deviceTokens.token, tokens))
}

// ---------------------------------------------------------------------------
// 1. registerDevice
// ---------------------------------------------------------------------------

export async function registerDevice(
  userId: string,
  token: string,
  platform: string,
) {
  // Upsert: if the token already exists (maybe for a different user),
  // update the userId and platform
  const [existing] = await db
    .select({ id: deviceTokens.id })
    .from(deviceTokens)
    .where(eq(deviceTokens.token, token))
    .limit(1)

  if (existing) {
    await db
      .update(deviceTokens)
      .set({ userId, platform, updatedAt: new Date() })
      .where(eq(deviceTokens.id, existing.id))

    return { id: existing.id, token, platform }
  }

  const [record] = await db
    .insert(deviceTokens)
    .values({ userId, token, platform })
    .returning()

  return record
}

// ---------------------------------------------------------------------------
// 2. unregisterDevice
// ---------------------------------------------------------------------------

export async function unregisterDevice(
  userId: string,
  token: string,
) {
  await db
    .delete(deviceTokens)
    .where(
      and(
        eq(deviceTokens.userId, userId),
        eq(deviceTokens.token, token),
      ),
    )

  return { success: true as const }
}

// ---------------------------------------------------------------------------
// 3. sendToUser
// ---------------------------------------------------------------------------

export async function sendToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const messaging = getMessaging()
  if (!messaging) return

  const tokens = await db
    .select({ token: deviceTokens.token })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId))

  if (tokens.length === 0) return

  const tokenStrings = tokens.map((t) => t.token)
  const response = await messaging.sendEachForMulticast({
    tokens: tokenStrings,
    notification: { title, body },
    data,
  })

  // Cleanup invalid tokens
  const invalidTokens: string[] = []
  response.responses.forEach((resp, idx) => {
    if (
      !resp.success &&
      resp.error &&
      (resp.error.code === 'messaging/registration-token-not-registered' ||
        resp.error.code === 'messaging/invalid-registration-token')
    ) {
      invalidTokens.push(tokenStrings[idx]!)
    }
  })

  await cleanupInvalidTokens(invalidTokens)
}

// ---------------------------------------------------------------------------
// 4. sendToUsers
// ---------------------------------------------------------------------------

export async function sendToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const messaging = getMessaging()
  if (!messaging) return
  if (userIds.length === 0) return

  const tokens = await db
    .select({ token: deviceTokens.token })
    .from(deviceTokens)
    .where(inArray(deviceTokens.userId, userIds))

  if (tokens.length === 0) return

  const tokenStrings = tokens.map((t) => t.token)

  // FCM sendEachForMulticast supports up to 500 tokens at a time
  const BATCH_SIZE = 500
  const invalidTokens: string[] = []

  for (let i = 0; i < tokenStrings.length; i += BATCH_SIZE) {
    const batch = tokenStrings.slice(i, i + BATCH_SIZE)
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      data,
    })

    response.responses.forEach((resp, idx) => {
      if (
        !resp.success &&
        resp.error &&
        (resp.error.code === 'messaging/registration-token-not-registered' ||
          resp.error.code === 'messaging/invalid-registration-token')
      ) {
        invalidTokens.push(batch[idx]!)
      }
    })
  }

  await cleanupInvalidTokens(invalidTokens)
}

// ---------------------------------------------------------------------------
// 5. sendToTopic
// ---------------------------------------------------------------------------

export async function sendToTopic(
  topic: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const messaging = getMessaging()
  if (!messaging) return

  await messaging.send({
    topic,
    notification: { title, body },
    data,
  })
}

// ---------------------------------------------------------------------------
// 6. notifyNewAnnouncement
// ---------------------------------------------------------------------------

export async function notifyNewAnnouncement(announcement: {
  id: string
  title: string
  venueId: string | null
}) {
  let recipientIds: string[] = []

  if (announcement.venueId) {
    // Venue-scoped: notify all venue members
    const members = await db
      .select({ userId: userVenues.userId })
      .from(userVenues)
      .where(eq(userVenues.venueId, announcement.venueId))

    recipientIds = members.map((m) => m.userId)
  } else {
    // System-scoped: notify all active users
    const allUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.status, 'active'))

    recipientIds = allUsers.map((u) => u.id)
  }

  if (recipientIds.length === 0) return

  await sendToUsers(
    recipientIds,
    'New Announcement',
    announcement.title,
    {
      type: 'announcement',
      announcementId: announcement.id,
    },
  )
}

// ---------------------------------------------------------------------------
// 7. notifyShiftUpdate
// ---------------------------------------------------------------------------

export async function notifyShiftUpdate(shift: {
  id: string
  userId: string
  type: string
}) {
  const titleMap: Record<string, string> = {
    created: 'New Shift Assigned',
    updated: 'Shift Updated',
    deleted: 'Shift Cancelled',
    swap_requested: 'Shift Swap Request',
    swap_accepted: 'Shift Swap Accepted',
    swap_declined: 'Shift Swap Declined',
  }

  const title = titleMap[shift.type] ?? 'Shift Update'

  await sendToUser(
    shift.userId,
    title,
    `Your shift schedule has been ${shift.type}.`,
    {
      type: 'shift',
      shiftId: shift.id,
      action: shift.type,
    },
  )
}

// ---------------------------------------------------------------------------
// 8. notifyNewDM
// ---------------------------------------------------------------------------

export async function notifyNewDM(
  senderId: string,
  recipientId: string,
  preview: string,
) {
  // Look up sender name
  const [sender] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1)

  const senderName = sender?.fullName ?? 'Someone'
  const truncatedPreview = preview.length > 100
    ? preview.slice(0, 100) + '...'
    : preview

  await sendToUser(
    recipientId,
    `DM from ${senderName}`,
    truncatedPreview,
    {
      type: 'dm',
      senderId,
    },
  )
}

// ---------------------------------------------------------------------------
// 9. notifyNewMessage
// ---------------------------------------------------------------------------

export async function notifyNewMessage(
  channelId: string,
  senderId: string,
  preview: string,
) {
  // Get channel name
  const [channel] = await db
    .select({ name: channels.name })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)

  if (!channel) return

  // Get all channel members except the sender
  const members = await db
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .where(
      and(
        eq(channelMembers.channelId, channelId),
        ne(channelMembers.userId, senderId),
      ),
    )

  if (members.length === 0) return

  // Skip users who are currently online (they see it in real time)
  const onlineUserIds = getOnlineUsers()
  const offlineRecipients = members
    .map((m) => m.userId)
    .filter((uid) => !onlineUserIds.has(uid))

  if (offlineRecipients.length === 0) return

  // Look up sender name
  const [sender] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, senderId))
    .limit(1)

  const senderName = sender?.fullName ?? 'Someone'
  const truncatedPreview = preview.length > 100
    ? preview.slice(0, 100) + '...'
    : preview

  await sendToUsers(
    offlineRecipients,
    `#${channel.name}`,
    `${senderName}: ${truncatedPreview}`,
    {
      type: 'channel_message',
      channelId,
      senderId,
    },
  )
}
