/**
 * Main layout — bottom tab navigator with Channels, DMs, and More tabs.
 *
 * Sets up socket listeners on mount and cleans up on unmount.
 */

import React, { useEffect } from 'react'
import { Tabs } from 'expo-router'
import { Text, StyleSheet } from 'react-native'
import { colors } from '../../src/theme/colors'
import { fontSize, fontWeight } from '../../src/theme/typography'
import { useChatStore } from '../../src/stores/chat'

export default function MainLayout() {
  const setupSocketListeners = useChatStore((s) => s.setupSocketListeners)

  useEffect(() => {
    const cleanup = setupSocketListeners()
    return cleanup
  }, [setupSocketListeners])

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
            <Text style={[styles.tabIcon, { color }]}>#</Text>
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
})
