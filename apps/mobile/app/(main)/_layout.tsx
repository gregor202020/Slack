/**
 * Main layout — bottom tab navigator with Channels, DMs, and More tabs.
 *
 * Sets up socket listeners on mount and cleans up on unmount.
 */

import React, { useEffect, useMemo } from 'react'
import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { colors } from '../../src/theme/colors'
import { fontSize, fontWeight } from '../../src/theme/typography'
import { useChatStore } from '../../src/stores/chat'

export default function MainLayout() {
  const setupSocketListeners = useChatStore((s) => s.setupSocketListeners)
  const fetchUnreadCounts = useChatStore((s) => s.fetchUnreadCounts)
  const unreadCounts = useChatStore((s) => s.unreadCounts)
  const channels = useChatStore((s) => s.channels)

  useEffect(() => {
    const cleanup = setupSocketListeners()
    return cleanup
  }, [setupSocketListeners])

  useEffect(() => {
    fetchUnreadCounts()
  }, [fetchUnreadCounts])

  // Compute total unread count for channels tab badge
  const totalChannelUnread = useMemo(() => {
    return channels.reduce((sum, ch) => sum + (unreadCounts[ch.id] ?? 0), 0)
  }, [channels, unreadCounts])

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand[500],
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="(channels)"
        options={{
          title: 'Channels',
          tabBarIcon: ({ color }) => (
            <View>
              <Text style={[styles.tabIcon, { color }]}>#</Text>
              {totalChannelUnread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {totalChannelUnread > 99 ? '99+' : totalChannelUnread}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="(search)"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>{'\u{1F50D}'}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="(dms)"
        options={{
          title: 'DMs',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>{'\u2709'}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="(more)"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => (
            <Text style={[styles.tabIcon, { color }]}>{'\u2026'}</Text>
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    paddingTop: 4,
    height: 56,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  tabIcon: {
    fontSize: 22,
    fontWeight: fontWeight.bold,
    marginBottom: -2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    backgroundColor: colors.brand[500],
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: fontWeight.bold,
  },
})
