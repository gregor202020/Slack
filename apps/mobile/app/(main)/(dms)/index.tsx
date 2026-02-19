/**
 * DM list screen — FlatList of direct message conversations.
 *
 * Shows each conversation with the other member's name and avatar,
 * last message preview, and unread indicator.
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  FlatList,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useChatStore, type DmConversation } from '../../../src/stores/chat'
import { useAuthStore } from '../../../src/stores/auth'
import { Avatar } from '../../../src/components/Avatar'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

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

function getDmDisplayName(dm: DmConversation, currentUserId?: string): string {
  if (dm.type === 'group') {
    const names = dm.members
      .filter((m) => m.userId !== currentUserId)
      .map((m) => m.displayName ?? m.fullName ?? 'Unknown')
    return names.join(', ')
  }

  const other = dm.members.find((m) => m.userId !== currentUserId)
  return other?.displayName ?? other?.fullName ?? 'Unknown'
}

function getDmAvatar(dm: DmConversation, currentUserId?: string) {
  if (dm.type === 'group') return null
  const other = dm.members.find((m) => m.userId !== currentUserId)
  return other?.avatarUrl ?? null
}

export default function DmListScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { dms, fetchDms, isLoadingDms, setActiveDm } = useChatStore()
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchDms()
  }, [fetchDms])

  const handlePress = useCallback(
    (dm: DmConversation) => {
      setActiveDm(dm.id)
      router.push({
        pathname: '/(main)/(dms)/[dmId]',
        params: { dmId: dm.id },
      })
    },
    [router, setActiveDm],
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchDms()
    setRefreshing(false)
  }, [fetchDms])

  const renderItem = useCallback(
    ({ item }: { item: DmConversation }) => {
      const displayName = getDmDisplayName(item, user?.id)
      const avatarUrl = getDmAvatar(item, user?.id)
      const hasUnread = item.unreadCount > 0

      return (
        <Pressable
          style={({ pressed }) => [
            styles.dmRow,
            pressed && styles.dmRowPressed,
          ]}
          onPress={() => handlePress(item)}
        >
          <Avatar
            imageUrl={avatarUrl}
            name={displayName}
            size={44}
          />

          <View style={styles.dmContent}>
            <View style={styles.dmTopRow}>
              <Text
                style={[styles.dmName, hasUnread && styles.dmNameUnread]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text style={styles.dmTime}>
                {formatRelativeTime(item.lastMessageAt)}
              </Text>
            </View>

            {item.lastMessagePreview && (
              <Text
                style={[styles.dmPreview, hasUnread && styles.dmPreviewUnread]}
                numberOfLines={1}
              >
                {item.lastMessagePreview}
              </Text>
            )}
          </View>

          {hasUnread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      )
    },
    [user?.id, handlePress],
  )

  if (isLoadingDms && dms.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={dms}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand[500]}
          />
        }
      />
    </SafeAreaView>
  )
}

function Separator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  list: {
    flexGrow: 1,
  },
  dmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  dmRowPressed: {
    backgroundColor: colors.smoke[50],
  },
  dmContent: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  dmTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dmName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  dmNameUnread: {
    fontWeight: fontWeight.semibold,
  },
  dmTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  dmPreview: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  dmPreviewUnread: {
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
  separator: {
    height: 1,
    backgroundColor: colors.divider,
    marginLeft: 72,
  },
})
