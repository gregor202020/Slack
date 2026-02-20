/**
 * Announcements screen — lists announcements with ack support.
 *
 * Uses GET /api/announcements and POST /api/announcements/:id/acknowledge.
 * Shows scope badge, title, body, timestamp, and ack status.
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  useAnnouncementsStore,
  type Announcement,
} from '../../../src/stores/announcements'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

// ---- Helpers ----

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffHours < 1) {
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    if (diffMinutes < 1) return 'Just now'
    return `${diffMinutes}m ago`
  }
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffHours < 48) return 'Yesterday'

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

function getScopeBadgeStyle(scope: string): {
  backgroundColor: string
  textColor: string
  label: string
} {
  switch (scope) {
    case 'system':
      return {
        backgroundColor: colors.accent[100],
        textColor: colors.accent[700],
        label: 'System',
      }
    case 'venue':
      return {
        backgroundColor: colors.brand[100],
        textColor: colors.brand[700],
        label: 'Venue',
      }
    case 'channel':
      return {
        backgroundColor: colors.smoke[200],
        textColor: colors.smoke[700],
        label: 'Channel',
      }
    default:
      return {
        backgroundColor: colors.smoke[100],
        textColor: colors.smoke[600],
        label: scope,
      }
  }
}

// ---- Components ----

function AnnouncementCard({
  announcement,
  isAcknowledging,
  onAcknowledge,
}: {
  announcement: Announcement
  isAcknowledging: boolean
  onAcknowledge: (id: string) => void
}) {
  const scopeStyle = getScopeBadgeStyle(announcement.scope)
  const needsAck = announcement.ackRequired && !announcement.userAcked

  return (
    <View style={styles.card}>
      {/* Header with scope badge and timestamp */}
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.scopeBadge,
            { backgroundColor: scopeStyle.backgroundColor },
          ]}
        >
          <Text style={[styles.scopeBadgeText, { color: scopeStyle.textColor }]}>
            {scopeStyle.label}
          </Text>
        </View>
        <Text style={styles.timestamp}>
          {formatTimestamp(announcement.createdAt)}
        </Text>
      </View>

      {/* Title and body */}
      <Text style={styles.cardTitle}>{announcement.title}</Text>
      <Text style={styles.cardBody} numberOfLines={4}>
        {announcement.body}
      </Text>

      {/* Author */}
      {announcement.authorName && (
        <Text style={styles.author}>By {announcement.authorName}</Text>
      )}

      {/* Ack status */}
      {announcement.ackRequired && (
        <View style={styles.ackSection}>
          {announcement.ackCount !== undefined && (
            <Text style={styles.ackCount}>
              {announcement.ackCount}
              {announcement.totalRecipients
                ? ` / ${announcement.totalRecipients}`
                : ''}{' '}
              acknowledged
            </Text>
          )}

          {needsAck ? (
            <Pressable
              style={[
                styles.ackButton,
                isAcknowledging && styles.ackButtonDisabled,
              ]}
              onPress={() => onAcknowledge(announcement.id)}
              disabled={isAcknowledging}
            >
              <Text style={styles.ackButtonText}>
                {isAcknowledging ? 'Acknowledging...' : 'Acknowledge'}
              </Text>
            </Pressable>
          ) : announcement.userAcked ? (
            <View style={styles.ackedBadge}>
              <Text style={styles.ackedBadgeText}>Acknowledged</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  )
}

// ---- Main Screen ----

export default function AnnouncementsScreen() {
  const {
    announcements,
    isLoading,
    isAcknowledging,
    fetchAnnouncements,
    acknowledgeAnnouncement,
  } = useAnnouncementsStore()
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAnnouncements()
    setRefreshing(false)
  }, [fetchAnnouncements])

  const handleAcknowledge = useCallback(
    async (announcementId: string) => {
      try {
        await acknowledgeAnnouncement(announcementId)
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to acknowledge'
        Alert.alert('Error', message)
      }
    },
    [acknowledgeAnnouncement],
  )

  const renderItem = useCallback(
    ({ item }: { item: Announcement }) => (
      <AnnouncementCard
        announcement={item}
        isAcknowledging={!!isAcknowledging[item.id]}
        onAcknowledge={handleAcknowledge}
      />
    ),
    [isAcknowledging, handleAcknowledge],
  )

  if (isLoading && announcements.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={announcements}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No announcements</Text>
          </View>
        }
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

// ---- Styles ----

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  list: {
    padding: 16,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  scopeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scopeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  timestamp: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  cardBody: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 8,
  },
  author: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 8,
  },

  // Ack section
  ackSection: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
    marginTop: 4,
  },
  ackCount: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: 8,
  },
  ackButton: {
    height: 40,
    backgroundColor: colors.brand[500],
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ackButtonDisabled: {
    backgroundColor: colors.brand[200],
  },
  ackButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  ackedBadge: {
    height: 40,
    backgroundColor: colors.success,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
  },
  ackedBadgeText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
})
