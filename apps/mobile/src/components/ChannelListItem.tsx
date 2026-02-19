/**
 * ChannelListItem — row in the channel or DM list.
 *
 * Shows the channel name (with # prefix), last message preview,
 * relative timestamp, and an unread count badge.
 */

import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors } from '../theme/colors'
import { fontSize, fontWeight } from '../theme/typography'

interface ChannelListItemProps {
  name: string
  lastMessage?: string | null
  lastMessageAt?: string | null
  unreadCount?: number
  isPrivate?: boolean
  onPress: () => void
}

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return ''
  const now = Date.now()
  const then = new Date(dateString).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`

  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

export function ChannelListItem({
  name,
  lastMessage,
  lastMessageAt,
  unreadCount = 0,
  isPrivate = false,
  onPress,
}: ChannelListItemProps) {
  const hasUnread = unreadCount > 0

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.iconColumn}>
        <View style={styles.hashContainer}>
          <Text style={styles.hashSymbol}>{isPrivate ? '\uD83D\uDD12' : '#'}</Text>
        </View>
      </View>

      <View style={styles.contentColumn}>
        <View style={styles.topRow}>
          <Text
            style={[styles.name, hasUnread && styles.nameUnread]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text style={styles.time}>{formatRelativeTime(lastMessageAt)}</Text>
        </View>

        {lastMessage && (
          <Text
            style={[styles.preview, hasUnread && styles.previewUnread]}
            numberOfLines={1}
          >
            {lastMessage}
          </Text>
        )}
      </View>

      {hasUnread && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.smoke[50],
  },
  iconColumn: {
    marginRight: 12,
  },
  hashContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.smoke[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashSymbol: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  contentColumn: {
    flex: 1,
    marginRight: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  nameUnread: {
    fontWeight: fontWeight.semibold,
  },
  time: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  preview: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  previewUnread: {
    color: colors.textSecondary,
  },
  badge: {
    backgroundColor: colors.brand[500],
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
})
