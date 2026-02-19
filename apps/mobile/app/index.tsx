/**
 * Root index — redirects to auth or main based on authentication state.
 *
 * While loading, shows a splash-colored screen.
 * Once resolved, redirects to the appropriate route group.
 */

import React from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuthStore } from '../src/stores/auth'
import { colors } from '../src/theme/colors'

export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.white} />
      </View>
    )
  }

  if (isAuthenticated) {
    return <Redirect href="/(main)/(channels)" />
  }

  return <Redirect href="/(auth)/login" />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
})
