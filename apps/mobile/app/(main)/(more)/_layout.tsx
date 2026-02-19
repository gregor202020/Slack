/**
 * More stack layout — stack navigator for settings, profile, and admin screens.
 */

import React from 'react'
import { Stack } from 'expo-router'
import { colors } from '../../../src/theme/colors'
import { fontWeight } from '../../../src/theme/typography'

export default function MoreLayout() {
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
        options={{ title: 'More' }}
      />
      <Stack.Screen
        name="profile"
        options={{ title: 'Edit Profile' }}
      />
    </Stack>
  )
}
