/**
 * DMs stack layout — stack navigator for DM list and conversation screens.
 */

import React from 'react'
import { Stack } from 'expo-router'
import { colors } from '../../../src/theme/colors'
import { fontWeight } from '../../../src/theme/typography'

export default function DmsLayout() {
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
        options={{ title: 'Direct Messages' }}
      />
      <Stack.Screen
        name="[dmId]"
        options={{ title: '' }}
      />
    </Stack>
  )
}
