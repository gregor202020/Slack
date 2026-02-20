/**
 * Notification Settings screen — manage notification preferences.
 *
 * Global toggle: all / mentions only / nothing.
 * Per-channel mute via PATCH /api/channels/:id/notification-pref.
 * Backend preferences via GET/PUT /api/notifications/preferences.
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient } from '../../../src/lib/api'
import { useChatStore, type Channel } from '../../../src/stores/chat'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

// ---- Types ----

type NotifLevel = 'all' | 'mentions' | 'muted'

interface NotifPreferences {
  announcements: boolean
  shifts: boolean
  dms: boolean
  channelMessages: boolean
  quietHoursEnabled: boolean
  quietHoursStart: string | null
  quietHoursEnd: string | null
}

// ---- Components ----

function GlobalPrefSelector({
  value,
  onChange,
}: {
  value: NotifLevel
  onChange: (val: NotifLevel) => void
}) {
  const options: { value: NotifLevel; label: string; description: string }[] = [
    {
      value: 'all',
      label: 'All Notifications',
      description: 'Receive all channel and DM notifications.',
    },
    {
      value: 'mentions',
      label: 'Mentions Only',
      description: 'Only notify when you are @mentioned.',
    },
    {
      value: 'muted',
      label: 'Nothing',
      description: 'Silence all notifications. Badge counts still appear.',
    },
  ]

  return (
    <View style={globalStyles.container}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          style={[
            globalStyles.option,
            value === option.value && globalStyles.optionSelected,
          ]}
          onPress={() => onChange(option.value)}
        >
          <View style={globalStyles.radio}>
            {value === option.value && (
              <View style={globalStyles.radioInner} />
            )}
          </View>
          <View style={globalStyles.optionInfo}>
            <Text style={globalStyles.optionLabel}>{option.label}</Text>
            <Text style={globalStyles.optionDesc}>{option.description}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

const globalStyles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  optionSelected: {
    backgroundColor: colors.brand[50],
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.brand[500],
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  optionDesc: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
})

function ChannelNotifRow({
  channel,
  onToggleMute,
}: {
  channel: Channel
  onToggleMute: (channelId: string, muted: boolean) => void
}) {
  // We'll track the muted state locally for responsive UI
  const [isMuted, setIsMuted] = useState(false)

  return (
    <View style={channelStyles.row}>
      <View style={channelStyles.info}>
        <Text style={channelStyles.name}>
          {channel.type === 'private' ? '\uD83D\uDD12' : '#'} {channel.name}
        </Text>
      </View>
      <View style={channelStyles.switchContainer}>
        <Text style={channelStyles.muteLabel}>
          {isMuted ? 'Muted' : 'Active'}
        </Text>
        <Switch
          value={isMuted}
          onValueChange={(val: boolean) => {
            setIsMuted(val)
            onToggleMute(channel.id, val)
          }}
          trackColor={{
            false: colors.smoke[300],
            true: colors.brand[300],
          }}
          thumbColor={isMuted ? colors.brand[500] : colors.smoke[50]}
        />
      </View>
    </View>
  )
}

const channelStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  muteLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    width: 40,
    textAlign: 'right',
  },
})

// ---- Toggle Row ----

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <View style={toggleStyles.row}>
      <Text style={toggleStyles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{
          false: colors.smoke[300],
          true: colors.brand[300],
        }}
        thumbColor={value ? colors.brand[500] : colors.smoke[50]}
      />
    </View>
  )
}

const toggleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  label: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    flex: 1,
  },
})

// ---- Main Screen ----

export default function NotificationSettingsScreen() {
  const { channels, fetchChannels, isLoadingChannels } = useChatStore()
  const [refreshing, setRefreshing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [globalLevel, setGlobalLevel] = useState<NotifLevel>('all')
  const [prefs, setPrefs] = useState<NotifPreferences>({
    announcements: true,
    shifts: true,
    dms: true,
    channelMessages: true,
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
  })

  const fetchPreferences = useCallback(async () => {
    try {
      const data = await apiClient.get<NotifPreferences>(
        '/notifications/preferences',
      )
      setPrefs(data)
      // Determine global level from prefs
      if (!data.channelMessages && !data.dms) {
        setGlobalLevel('muted')
      } else if (data.channelMessages && data.dms) {
        setGlobalLevel('all')
      } else {
        setGlobalLevel('mentions')
      }
    } catch {
      // Use defaults
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPreferences()
    fetchChannels()
  }, [fetchPreferences, fetchChannels])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchPreferences(), fetchChannels()])
    setRefreshing(false)
  }, [fetchPreferences, fetchChannels])

  const handleGlobalChange = useCallback(
    async (level: NotifLevel) => {
      setGlobalLevel(level)

      const updatedPrefs: Partial<NotifPreferences> = {}
      switch (level) {
        case 'all':
          updatedPrefs.channelMessages = true
          updatedPrefs.dms = true
          break
        case 'mentions':
          updatedPrefs.channelMessages = true
          updatedPrefs.dms = true
          break
        case 'muted':
          updatedPrefs.channelMessages = false
          updatedPrefs.dms = false
          break
      }

      setPrefs((prev) => ({ ...prev, ...updatedPrefs }))

      try {
        await apiClient.put('/notifications/preferences', {
          ...prefs,
          ...updatedPrefs,
        })
      } catch {
        Alert.alert('Error', 'Failed to save notification preferences.')
      }
    },
    [prefs],
  )

  const handleTogglePref = useCallback(
    async (key: keyof NotifPreferences, value: boolean) => {
      const updated = { ...prefs, [key]: value }
      setPrefs(updated)

      try {
        await apiClient.put('/notifications/preferences', updated)
      } catch {
        Alert.alert('Error', 'Failed to save notification preferences.')
        setPrefs((prev) => ({ ...prev, [key]: !value }))
      }
    },
    [prefs],
  )

  const handleToggleChannelMute = useCallback(
    async (channelId: string, muted: boolean) => {
      try {
        await apiClient.patch(`/channels/${channelId}/notification-pref`, {
          pref: muted ? 'muted' : 'all',
        })
      } catch {
        Alert.alert('Error', 'Failed to update channel notification setting.')
      }
    },
    [],
  )

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        renderItem={({ item }: { item: Channel }) => (
          <ChannelNotifRow
            channel={item}
            onToggleMute={handleToggleChannelMute}
          />
        )}
        ListHeaderComponent={
          <>
            {/* Global level */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Default Notification Level</Text>
              <GlobalPrefSelector
                value={globalLevel}
                onChange={handleGlobalChange}
              />
            </View>

            {/* Category toggles */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Categories</Text>
              <View style={styles.toggleGroup}>
                <ToggleRow
                  label="Announcements"
                  value={prefs.announcements}
                  onChange={(val) => handleTogglePref('announcements', val)}
                />
                <ToggleRow
                  label="Shift Updates"
                  value={prefs.shifts}
                  onChange={(val) => handleTogglePref('shifts', val)}
                />
                <ToggleRow
                  label="Direct Messages"
                  value={prefs.dms}
                  onChange={(val) => handleTogglePref('dms', val)}
                />
                <ToggleRow
                  label="Channel Messages"
                  value={prefs.channelMessages}
                  onChange={(val) =>
                    handleTogglePref('channelMessages', val)
                  }
                />
              </View>
            </View>

            {/* Per-channel section header */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Per-Channel Settings</Text>
              <Text style={styles.sectionHint}>
                Toggle individual channels to mute their notifications.
              </Text>
            </View>

            {isLoadingChannels && channels.length === 0 && (
              <View style={styles.channelLoading}>
                <ActivityIndicator
                  size="small"
                  color={colors.brand[500]}
                />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !isLoadingChannels ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No channels to configure
              </Text>
            </View>
          ) : null
        }
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
    flexGrow: 1,
    paddingBottom: 24,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 8,
  },
  toggleGroup: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  channelLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
})
