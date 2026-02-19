/**
 * Auth layout — stack navigator for login and OTP verification screens.
 */

import React from 'react'
import { Stack } from 'expo-router'
import { colors } from '../../src/theme/colors'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="verify" />
    </Stack>
  )
}
