/**
 * More/Settings screen — profile card, admin link, and logout.
 */

import React from 'react'
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../../../src/stores/auth'
import { Avatar } from '../../../src/components/Avatar'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

export default function MoreScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const isAdmin = user?.orgRole === 'admin' || user?.orgRole === 'super_admin'

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Profile card */}
      <Pressable
        style={styles.profileCard}
        onPress={() => router.push('/(main)/(more)/profile')}
      >
        <Avatar
          imageUrl={user?.avatarUrl}
          name={user?.fullName ?? user?.displayName}
          size={56}
        />
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {user?.displayName ?? user?.fullName ?? 'Unknown'}
          </Text>
          <Text style={styles.profileRole}>
            {formatRole(user?.orgRole)}
          </Text>
          <Text style={styles.profilePhone}>{user?.phone}</Text>
        </View>
        <Text style={styles.chevron}>{'\u203A'}</Text>
      </Pressable>

      {/* Menu items */}
      <View style={styles.section}>
        <MenuItem
          label="Edit Profile"
          onPress={() => router.push('/(main)/(more)/profile')}
        />
        <MenuItem
          label="My Shifts"
          onPress={() => router.push('/(main)/(more)/shifts')}
        />
        <MenuItem
          label="Announcements"
          onPress={() => router.push('/(main)/(more)/announcements')}
        />
        <MenuItem
          label="Notification Settings"
          onPress={() => router.push('/(main)/(more)/notifications')}
        />

        {isAdmin && (
          <MenuItem
            label="Admin Dashboard"
            onPress={() => {
              Alert.alert(
                'Admin Dashboard',
                'The admin dashboard is available on the web app.',
              )
            }}
          />
        )}
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <Pressable
          style={({ pressed }) => [
            styles.menuItem,
            pressed && styles.menuItemPressed,
          ]}
          onPress={handleLogout}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </Pressable>
      </View>

      {/* App version */}
      <Text style={styles.version}>The Smoker v1.0.0</Text>
    </SafeAreaView>
  )
}

function MenuItem({
  label,
  onPress,
}: {
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        pressed && styles.menuItemPressed,
      ]}
      onPress={onPress}
    >
      <Text style={styles.menuItemText}>{label}</Text>
      <Text style={styles.chevron}>{'\u203A'}</Text>
    </Pressable>
  )
}

function formatRole(role?: string): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin'
    case 'admin':
      return 'Admin'
    case 'mid':
      return 'Manager'
    case 'basic':
      return 'Team Member'
    default:
      return 'Team Member'
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  profileRole: {
    fontSize: fontSize.sm,
    color: colors.brand[500],
    marginTop: 2,
  },
  profilePhone: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  chevron: {
    fontSize: fontSize.xl,
    color: colors.textMuted,
    marginLeft: 8,
  },
  section: {
    backgroundColor: colors.surface,
    marginBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  menuItemPressed: {
    backgroundColor: colors.smoke[50],
  },
  menuItemText: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  logoutText: {
    fontSize: fontSize.base,
    color: colors.error,
    fontWeight: fontWeight.medium,
  },
  version: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
  },
})
