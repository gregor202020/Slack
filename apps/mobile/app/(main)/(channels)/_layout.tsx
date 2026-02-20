/**
 * Channels stack layout — stack navigator for channel list, detail, and create screens.
 */

import React from 'react'
import { Stack } from 'expo-router'
import { colors } from '../../../src/theme/colors'
import { fontWeight } from '../../../src/theme/typography'

export default function ChannelsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.brand[500],
        headerTitleStyle: { fontWeight: fontWeight.semibold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Channels' }}
      />
      <Stack.Screen
        name="[channelId]"
        options={{ title: '' }}
      />
      <Stack.Screen
        name="create"
        options={{
          title: 'Create Channel',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="thread/[messageId]"
        options={{ title: 'Thread' }}
      />
    </Stack>
  )
}
