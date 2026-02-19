/**
 * Root layout — wraps the entire app with SafeAreaProvider and StatusBar.
 *
 * Uses expo-router's Slot to render nested routes.
 */

import React, { useEffect } from 'react'
import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuthStore } from '../src/stores/auth'

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Slot />
    </SafeAreaProvider>
  )
}
